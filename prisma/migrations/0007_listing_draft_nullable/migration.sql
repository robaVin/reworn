-- =============================================================================
-- 0007 — Drafts may be incomplete; publishing requires completeness
-- =============================================================================
-- Forward-only. Makes the listing content columns nullable so a DRAFT can be
-- saved partially, and adds a CHECK that a PUBLISHED listing must have all
-- mandatory fields. `title` stays NOT NULL (every listing is titled).
--
-- Safe on existing data: DROP NOT NULL never fails; the new CHECK is satisfied
-- by all non-published rows and by any complete published row (there are no
-- listings yet at time of writing).
--
-- Note: the length/price CHECKs from 0006 remain valid — a NULL value makes
-- those predicates UNKNOWN, which SQL treats as satisfied.
-- =============================================================================

ALTER TABLE "listings"
  ALTER COLUMN "category_id" DROP NOT NULL,
  ALTER COLUMN "description" DROP NOT NULL,
  ALTER COLUMN "size" DROP NOT NULL,
  ALTER COLUMN "condition" DROP NOT NULL,
  ALTER COLUMN "price_minor" DROP NOT NULL,
  ALTER COLUMN "location" DROP NOT NULL;

-- A published listing must be complete. Drafts/paused/archived are exempt.
ALTER TABLE "listings"
  ADD CONSTRAINT "chk_listing_published_complete"
  CHECK (
    "status" <> 'published'
    OR (
      "category_id" IS NOT NULL
      AND "description" IS NOT NULL
      AND "size" IS NOT NULL
      AND "condition" IS NOT NULL
      AND "price_minor" IS NOT NULL
      AND "location" IS NOT NULL
    )
  );
