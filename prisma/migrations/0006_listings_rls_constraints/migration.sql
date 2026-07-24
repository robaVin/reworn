-- =============================================================================
-- 0006 — Listings: RLS + data-integrity constraints
-- =============================================================================
-- Forward-only. Applies the read-path RLS and CHECK constraints for the
-- `listings` table created in 0005. Writes are NOT granted to user roles: all
-- listing mutations go through the authorized listing service (privileged path
-- with explicit ownership + entitlement). RLS governs reads:
--   • anyone may read PUBLISHED listings
--   • a seller may read their OWN listings in any status
--   • admins may read all
-- Uses the portable JWT-claim helpers from migration 0004
-- (public.current_app_user_id / current_app_is_admin).
-- =============================================================================

-- 1. Data-integrity CHECK constraints ---------------------------------------
ALTER TABLE "listings"
  ADD CONSTRAINT "chk_listing_price_nonneg"     CHECK ("price_minor" >= 0),
  ADD CONSTRAINT "chk_listing_original_nonneg"  CHECK ("original_price_minor" IS NULL OR "original_price_minor" >= 0),
  ADD CONSTRAINT "chk_listing_currency_iso"     CHECK (char_length("currency") = 3),
  ADD CONSTRAINT "chk_listing_title_len"        CHECK (char_length("title") BETWEEN 1 AND 140),
  ADD CONSTRAINT "chk_listing_description_len"  CHECK (char_length("description") BETWEEN 1 AND 4000),
  ADD CONSTRAINT "chk_listing_size_len"         CHECK (char_length("size") BETWEEN 1 AND 40),
  ADD CONSTRAINT "chk_listing_location_len"     CHECK (char_length("location") BETWEEN 1 AND 120),
  -- A published listing must have a published_at timestamp.
  ADD CONSTRAINT "chk_listing_published_at"
    CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);

-- 2. Row-Level Security ------------------------------------------------------
ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listings" FORCE ROW LEVEL SECURITY;

-- Deterministic grants: authenticated + anon may SELECT (RLS filters rows);
-- no write grants, so user-driven writes are impossible regardless of policy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "listings" FROM anon;
    GRANT SELECT ON "listings" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "listings" FROM authenticated;
    GRANT SELECT ON "listings" TO authenticated;
  END IF;
END $$;

-- 3. Policies ---------------------------------------------------------------
-- Public: anyone may read published listings.
CREATE POLICY "listings_select_published_anon" ON "listings"
  FOR SELECT TO anon
  USING ("status" = 'published');

CREATE POLICY "listings_select_published_auth" ON "listings"
  FOR SELECT TO authenticated
  USING ("status" = 'published');

-- Owner: a seller may read their own listings in ANY status (drafts, paused…).
CREATE POLICY "listings_select_own" ON "listings"
  FOR SELECT TO authenticated
  USING (
    "seller_id" IN (
      SELECT id FROM seller_profiles
      WHERE profile_id = public.current_app_user_id()
    )
  );

-- Admin: read everything.
CREATE POLICY "listings_admin_select" ON "listings"
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());
