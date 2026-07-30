-- Increment UX-1.2A: product detail page foundations.
--
-- Adds three columns to `listings`:
--   * delivery_method  (enum, NOT NULL, default 'unspecified') + delivery_note
--     (nullable free text): informational hand-over details. ReWorn never
--     brokers delivery; this only describes what the seller offers.
--   * slug (nullable, UNIQUE): a stable, human-readable public URL key for the
--     product detail page (/products/[slug]). Generated ONCE at first publish
--     and never changed, so public URLs stay stable across later edits.
--
-- Backfill: existing PUBLISHED listings receive a slug derived from their
-- current title plus a short id-derived code (guarantees uniqueness). Drafts
-- keep a NULL slug until they are first published (a UNIQUE index treats NULLs
-- as distinct, so any number of drafts coexist). ASCII-only.

-- 1. Delivery method enum.
CREATE TYPE "delivery_method" AS ENUM ('unspecified', 'shipping', 'pickup', 'both');

-- 2. New columns.
ALTER TABLE "listings"
  ADD COLUMN "delivery_method" "delivery_method" NOT NULL DEFAULT 'unspecified',
  ADD COLUMN "delivery_note" text,
  ADD COLUMN "slug" text;

-- 3. Backfill slug for existing PUBLISHED rows only.
--    kebab(title): lowercase, runs of non-alphanumerics -> '-', trim leading/
--    trailing '-', cap the human part at 60 chars, then append '-' + the first
--    8 hex chars of the row id (the id is unique, so the slug is too).
UPDATE "listings"
SET "slug" =
      left(
        regexp_replace(
          regexp_replace(
            lower(coalesce(nullif(btrim("title"), ''), 'listing')),
            '[^a-z0-9]+', '-', 'g'
          ),
          '(^-+|-+$)', '', 'g'
        ),
        60
      )
      || '-' || substr(replace("id"::text, '-', ''), 1, 8)
WHERE "status" = 'published' AND "slug" IS NULL;

-- 4. Uniqueness. A standard UNIQUE index allows multiple NULLs, so unpublished
--    drafts (NULL slug) never collide with each other.
CREATE UNIQUE INDEX "ux_listings_slug" ON "listings" ("slug");
