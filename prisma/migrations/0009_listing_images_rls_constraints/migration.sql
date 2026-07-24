-- =============================================================================
-- 0009 — listing_images: RLS + data-integrity constraints
-- =============================================================================
-- Forward-only. Reads follow the same visibility rules as the parent listing:
--   • anyone may read images of a PUBLISHED listing
--   • a seller may read images of their OWN listings (any status)
--   • admins may read all
-- Writes are NOT granted to user roles — image mutations go through the
-- authorized image service (privileged path + explicit ownership). Files
-- themselves live in a private Storage bucket and are read via signed URLs.
-- =============================================================================

-- 1. Integrity CHECKs -------------------------------------------------------
ALTER TABLE "listing_images"
  ADD CONSTRAINT "chk_image_width_pos"    CHECK ("width" > 0),
  ADD CONSTRAINT "chk_image_height_pos"   CHECK ("height" > 0),
  ADD CONSTRAINT "chk_image_bytes_pos"    CHECK ("byte_size" > 0),
  ADD CONSTRAINT "chk_image_position_nn"  CHECK ("position" >= 0),
  ADD CONSTRAINT "chk_image_mime_allowed"
    CHECK ("mime_type" IN ('image/webp', 'image/jpeg', 'image/png'));

-- 2. Row-Level Security -----------------------------------------------------
ALTER TABLE "listing_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_images" FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "listing_images" FROM anon;
    GRANT SELECT ON "listing_images" TO anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "listing_images" FROM authenticated;
    GRANT SELECT ON "listing_images" TO authenticated;
  END IF;
END $$;

-- Public: images of published listings.
CREATE POLICY "listing_images_select_published_anon" ON "listing_images"
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id AND l.status = 'published'
    )
  );

CREATE POLICY "listing_images_select_published_auth" ON "listing_images"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = listing_id AND l.status = 'published'
    )
  );

-- Owner: images of the seller's own listings (any status).
CREATE POLICY "listing_images_select_own" ON "listing_images"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM listings l
      JOIN seller_profiles sp ON sp.id = l.seller_id
      WHERE l.id = listing_id
        AND sp.profile_id = public.current_app_user_id()
    )
  );

-- Admin: everything.
CREATE POLICY "listing_images_admin_select" ON "listing_images"
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());
