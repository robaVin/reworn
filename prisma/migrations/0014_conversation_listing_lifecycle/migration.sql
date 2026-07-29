-- =============================================================================
-- 0014 -- Conversation listing lifecycle + monotonic activity (3A follow-ups)
-- =============================================================================
-- Forward-only. Two hardening changes to the messaging domain from 0013:
--
--  1. CONVERSATION HISTORY MUST SURVIVE LISTING REMOVAL. The 0013 FK
--     conversations.listing_id -> listings was ON DELETE CASCADE, which would
--     destroy a conversation (and its messages) if the listing row were ever
--     hard-deleted. That is replaced with ON DELETE SET NULL, and an immutable
--     point-in-time listing snapshot (title / price / currency, captured at
--     conversation creation) is added so a conversation still shows what it was
--     about after the live listing is gone. While the listing exists, the live
--     row is preferred; the snapshot only surfaces once listing_id is NULL.
--
--     (RESTRICT was rejected because it would make the existing
--     profile -> seller_profile -> listing CASCADE chain fail whenever a
--     conversation referenced the listing; SET NULL + snapshot preserves history
--     without breaking that chain.)
--
--  2. ACTIVITY TIMESTAMP MUST BE MONOTONIC. The 0013 AFTER INSERT trigger set
--     last_message_at = NEW.created_at unconditionally, so an out-of-order or
--     concurrent insert of an older-timestamped message could move it BACKWARDS.
--     It now uses GREATEST(last_message_at, NEW.created_at): the value only ever
--     advances, so it can never be older than the newest inserted message.
--
-- ASCII-only by policy (files are read as WIN1252 by the Windows toolchain).
-- =============================================================================

-- 1. listing_id becomes nullable and the FK becomes ON DELETE SET NULL --------
ALTER TABLE "conversations" ALTER COLUMN "listing_id" DROP NOT NULL;

ALTER TABLE "conversations" DROP CONSTRAINT "conversations_listing_id_fkey";
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "listings"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Immutable listing snapshot columns ---------------------------------------
ALTER TABLE "conversations"
    ADD COLUMN "listing_title_snapshot" TEXT,
    ADD COLUMN "listing_price_minor_snapshot" INTEGER,
    ADD COLUMN "listing_currency_snapshot" CHAR(3);

-- Backfill any existing conversations from their live listing (no-op on a fresh
-- database, where 0014 applies immediately after 0013 with no rows yet).
UPDATE "conversations" c
   SET "listing_title_snapshot" = l."title",
       "listing_price_minor_snapshot" = l."price_minor",
       "listing_currency_snapshot" = l."currency"
  FROM "listings" l
 WHERE l."id" = c."listing_id";

-- Title + currency are always known at creation, so they are NOT NULL going
-- forward (the service captures them). Price may legitimately be null.
ALTER TABLE "conversations" ALTER COLUMN "listing_title_snapshot" SET NOT NULL;
ALTER TABLE "conversations" ALTER COLUMN "listing_currency_snapshot" SET NOT NULL;

-- 3. Make the activity-bump trigger monotonic ---------------------------------
-- CREATE OR REPLACE swaps the function body in place; the trigger created in
-- 0013 keeps referencing it by name, so no trigger change is needed.
CREATE OR REPLACE FUNCTION public.conversations_bump_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
     SET last_message_at = GREATEST(last_message_at, NEW.created_at),
         updated_at = now()
   WHERE id = NEW.conversation_id;
  RETURN NULL;
END;
$$;
