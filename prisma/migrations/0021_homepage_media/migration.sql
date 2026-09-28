-- =============================================================================
-- 0021 - Homepage media: admin overrides for the fixed homepage image slots
-- =============================================================================
-- Forward-only (migrate deploy). Adds ONE table, `homepage_media`, plus its
-- enum, constraints and lock-down RLS. No existing table/enum/migration is
-- modified (0020 and earlier are untouched).
--
-- MODEL: at most one override per homepage slot (the slot IS the primary key).
-- `storage_key` is a server-generated, immutable, versioned object key in the
-- private image bucket (homepage/<slot>/<uuid>.webp); reads are signed at render.
-- When no row exists for a slot the homepage falls back to the bundled
-- public/photos/* default, so an EMPTY table never breaks the page.
--
-- AUTHORIZATION: this is admin-managed system config. Reads (homepage SSR) and
-- writes (admin actions) both go through the PRIVILEGED Prisma connection, which
-- bypasses RLS. No user role ever touches it directly, and the public consumes
-- only the rendered image, never this table -> enable+force RLS with NO grants
-- and NO policies. Mirrors the "writes via privileged service" posture of
-- migrations 0006/0009/0013/0020.
-- =============================================================================

-- 1. Enum: the five fixed slots (closed set) --------------------------------
CREATE TYPE "homepage_slot" AS ENUM ('hero', 'inside_1', 'inside_2', 'inside_3', 'story');

-- 2. Table -------------------------------------------------------------------
CREATE TABLE "homepage_media" (
    "slot" "homepage_slot" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "homepage_media_pkey" PRIMARY KEY ("slot")
);

-- 3. Data-integrity CHECK constraints ----------------------------------------
ALTER TABLE "homepage_media"
  ADD CONSTRAINT "chk_homepage_media_alt_len"
    CHECK (char_length("alt_text") BETWEEN 1 AND 300),
  ADD CONSTRAINT "chk_homepage_media_dims"
    CHECK ("width" > 0 AND "height" > 0);

ALTER TABLE "homepage_media" ADD CONSTRAINT "homepage_media_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Row-Level Security: privileged-path only --------------------------------
ALTER TABLE "homepage_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "homepage_media" FORCE ROW LEVEL SECURITY;

-- No grants and no policies: anon/authenticated cannot read or write. Only the
-- service-role/privileged connection (which bypasses RLS) can touch the table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "homepage_media" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "homepage_media" FROM authenticated;
  END IF;
END $$;
