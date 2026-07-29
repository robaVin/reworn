-- =============================================================================
-- 0013 -- Messaging domain (Increment 3A)
-- =============================================================================
-- Forward-only. Adds buyer <-> seller conversations about a listing and their
-- messages. Mirrors the project's two-layer security model:
--   1. TABLE GRANTS decide which verbs a role may attempt. anon/authenticated
--      receive SELECT only; NO write grants, so user-driven INSERT/UPDATE/DELETE
--      is impossible regardless of policy. The privileged Prisma/service-role
--      path (BYPASSRLS) performs all controlled writes and is separately
--      authorized in the messaging service.
--   2. RLS POLICIES decide which rows -- participants only. A third party gets
--      zero rows and therefore no existence signal.
--
-- Atomicity: a message insert bumps its conversation's activity timestamp inside
-- an AFTER INSERT TRIGGER, so the two writes commit together. This is chosen
-- over an application-level second write (which could silently fail after the
-- insert) and over a plain transaction (which would not protect a future direct
-- write path). A BEFORE INSERT trigger additionally guarantees the sender is one
-- of the conversation's two participants at the database level.
--
-- Deletion lifecycle (documented): every FK is ON DELETE CASCADE, consistent
-- with the existing profile -> seller_profile -> listing cascade policy. Access
-- to a conversation is participant-based and INDEPENDENT of listing status, so a
-- conversation survives the listing being paused/archived; it is removed only if
-- a participant profile or the listing ROW is hard-deleted (no such path is
-- exposed by any current increment). Message editing/deletion is deferred, so no
-- UPDATE/DELETE path exists yet.
--
-- ASCII-only by policy (files are read as WIN1252 by the Windows toolchain).
-- =============================================================================

-- 1. Tables (managed shape matches the Prisma models in schema.prisma) --------

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "buyer_profile_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_profile_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- 2. Indexes (pinned names match the @@unique/@@index maps in the schema) ------

-- CreateIndex: idempotent identity -- one conversation per (listing, buyer, seller).
CREATE UNIQUE INDEX "conversations_identity_key"
    ON "conversations" ("listing_id", "buyer_profile_id", "seller_profile_id");

-- CreateIndex: buyer inbox by latest activity (keyset: last_message_at DESC, id DESC).
CREATE INDEX "conversations_buyer_activity_idx"
    ON "conversations" ("buyer_profile_id", "last_message_at" DESC, "id" DESC);

-- CreateIndex: seller inbox by latest activity.
CREATE INDEX "conversations_seller_activity_idx"
    ON "conversations" ("seller_profile_id", "last_message_at" DESC, "id" DESC);

-- CreateIndex: deterministic chronological retrieval + keyset within a conversation.
CREATE INDEX "messages_conversation_chrono_idx"
    ON "messages" ("conversation_id", "created_at", "id");

-- 3. Foreign keys (all ON DELETE CASCADE -- see deletion lifecycle above) ------

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_buyer_profile_id_fkey"
    FOREIGN KEY ("buyer_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seller_profile_id_fkey"
    FOREIGN KEY ("seller_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_profile_id_fkey"
    FOREIGN KEY ("sender_profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Data-integrity CHECK constraints -----------------------------------------
-- Buyer and seller must differ (a seller cannot open a buyer-style conversation
-- with their own listing).
ALTER TABLE "conversations"
    ADD CONSTRAINT "chk_conversation_distinct_participants"
    CHECK ("buyer_profile_id" <> "seller_profile_id");

-- Message body backstops (the service normalizes/validates first):
--   * bounded length 1..4000 (documented maximum),
--   * non-empty after trimming surrounding whitespace,
--   * no unsupported control characters (TAB 0x09 and LF 0x0A are allowed;
--     everything else in the C0 range and DEL 0x7F is rejected). The service
--     normalizes CR/CRLF to LF before insert, so 0x0D never reaches storage.
ALTER TABLE "messages"
    ADD CONSTRAINT "chk_message_body_len"
      CHECK (char_length("body") BETWEEN 1 AND 4000),
    ADD CONSTRAINT "chk_message_body_nonblank"
      CHECK (btrim("body") <> ''),
    ADD CONSTRAINT "chk_message_body_no_control"
      CHECK ("body" !~ E'[\\x00-\\x08\\x0B-\\x1F\\x7F]');

-- 5. Sender-participation + activity-bump triggers ----------------------------
-- BEFORE INSERT: the author must be one of the conversation's two participants.
-- SECURITY DEFINER so the check reads `conversations` regardless of the caller's
-- RLS/grants.
CREATE OR REPLACE FUNCTION public.messages_assert_sender_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_participant boolean;
BEGIN
  SELECT (NEW.sender_profile_id IN (c.buyer_profile_id, c.seller_profile_id))
    INTO is_participant
    FROM conversations c
   WHERE c.id = NEW.conversation_id;

  IF is_participant IS NULL THEN
    -- No such conversation -- treat as a referential failure.
    RAISE EXCEPTION 'message references unknown conversation %', NEW.conversation_id
      USING ERRCODE = '23503';
  ELSIF NOT is_participant THEN
    RAISE EXCEPTION 'sender is not a participant of conversation %', NEW.conversation_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER INSERT: bump the conversation's activity timestamp atomically with the
-- message insert. SECURITY DEFINER so the UPDATE is not blocked by RLS on any
-- future non-privileged write path.
CREATE OR REPLACE FUNCTION public.conversations_bump_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
     SET last_message_at = NEW.created_at,
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.messages_assert_sender_participant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conversations_bump_activity() FROM PUBLIC;

CREATE TRIGGER "trg_messages_assert_sender"
  BEFORE INSERT ON "messages"
  FOR EACH ROW EXECUTE FUNCTION public.messages_assert_sender_participant();

CREATE TRIGGER "trg_messages_bump_activity"
  AFTER INSERT ON "messages"
  FOR EACH ROW EXECUTE FUNCTION public.conversations_bump_activity();

-- 6. Row-Level Security -------------------------------------------------------
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conversations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" FORCE ROW LEVEL SECURITY;

-- Grants: private data, so anon gets NOTHING; authenticated may SELECT (RLS
-- filters rows). No write grants anywhere -> user-driven writes are impossible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "conversations" FROM anon;
    REVOKE ALL ON "messages" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "conversations" FROM authenticated;
    REVOKE ALL ON "messages" FROM authenticated;
    GRANT SELECT ON "conversations" TO authenticated;
    GRANT SELECT ON "messages" TO authenticated;
  END IF;
END $$;

-- Policies: only the two participants may read a conversation or its messages.
-- There are deliberately NO admin policies (private correspondence; moderation
-- is out of scope) and NO write policies (writes go through the privileged
-- service only).
CREATE POLICY "conversations_select_participant" ON "conversations"
  FOR SELECT TO authenticated
  USING (public.current_app_user_id() IN ("buyer_profile_id", "seller_profile_id"));

CREATE POLICY "messages_select_participant" ON "messages"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "conversations" c
      WHERE c.id = "messages"."conversation_id"
        AND public.current_app_user_id() IN (c.buyer_profile_id, c.seller_profile_id)
    )
  );
