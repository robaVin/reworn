-- =============================================================================
-- 0020 - Saved items (wishlist): a user's set of saved listings
-- =============================================================================
-- Forward-only (migrate deploy). Adds ONE new table, `saved_items`, plus its
-- constraints, indexes and read-path RLS. No existing table/enum/migration is
-- modified (0019 and earlier are untouched).
--
-- MODEL: one row per (user, listing). `user_id` is the Profile (auth) uuid,
-- ALWAYS derived server-side from the authenticated session; the composite
-- UNIQUE makes saving idempotent and race-safe. FKs cascade so a deleted
-- profile or listing takes its saved rows with it (listings are lifecycle-only
-- in the app, never hard-deleted, so this never blocks anything).
--
-- AUTHORIZATION: no write grants to user roles -> user-driven INSERT/UPDATE/
-- DELETE are impossible regardless of policy; all mutations go through the
-- privileged listing/saved service with explicit server-side ownership. RLS is
-- the READ backstop: a user may read ONLY their own saved rows. Mirrors the
-- pattern in migrations 0006 (listings) and 0013 (messaging).
--
-- VISIBILITY: this table stores relations only; it never widens listing
-- visibility. `/saved` reuses the public contract (published or sold), so a
-- saved draft/paused/archived listing keeps its row but is never exposed.
-- =============================================================================

-- 1. Table --------------------------------------------------------------------
CREATE TABLE "saved_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_items_pkey" PRIMARY KEY ("id")
);

-- 2. Constraints + indexes ----------------------------------------------------
-- At most one save per (user, listing): the final concurrency backstop.
CREATE UNIQUE INDEX "saved_items_user_listing_key" ON "saved_items"("user_id", "listing_id");
-- "My saved listings, newest first" + bounded existence lookups per user.
CREATE INDEX "saved_items_user_id_created_at_idx" ON "saved_items"("user_id", "created_at" DESC);

ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Row-Level Security -------------------------------------------------------
ALTER TABLE "saved_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_items" FORCE ROW LEVEL SECURITY;

-- Grants: authenticated may SELECT (RLS filters to own rows); anon gets nothing.
-- No INSERT/UPDATE/DELETE grants to any user role -> writes only via the
-- privileged service connection.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "saved_items" FROM authenticated;
    GRANT SELECT ON "saved_items" TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "saved_items" FROM anon;
  END IF;
END $$;

-- A user may read ONLY their own saved rows (no cross-user enumeration).
CREATE POLICY "saved_items_select_own" ON "saved_items"
  FOR SELECT TO authenticated
  USING (public.current_app_user_id() = "user_id");
