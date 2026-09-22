-- =============================================================================
-- 0019 — Listings: add the `sold` lifecycle state + seller-declared sold_at
-- =============================================================================
-- Forward-only (migrate deploy). Extends the listing lifecycle with a
-- first-class `sold` state that the OWNER sets to mark an item no longer
-- available. `sold_at` records the server timestamp of that seller declaration.
--
-- SEMANTICS: `sold` / `sold_at` are seller-declared lifecycle facts ONLY.
-- Galerija does not broker the sale, so they NEVER imply a processed
-- transaction, verified payment, sale amount, buyer identity, earnings, or
-- settlement. There is no goods-order / goods-payment model, and none is added.
--
-- `sold` is inserted BEFORE `archived` to keep the enum in lifecycle order
-- (draft -> published -> paused -> sold -> archived). This migration ADDS the
-- enum value and a nullable column but does NOT use the new value, so it is safe
-- within the single migration transaction (PostgreSQL 12+; this repo runs 18).
--
-- Public marketplace reads continue to hard-filter status='published'
-- (browse/search/related/storefront + partial indexes from 0012), so a sold
-- listing is automatically excluded from available inventory. The existing
-- chk_listing_published_at CHECK is unaffected — `status <> 'published'` holds
-- for sold rows. RLS public-read policies (0006) stay published-only as a
-- stricter backstop; the seller's own rows remain readable in any status.
-- =============================================================================

-- 1. Extend the lifecycle enum (in lifecycle order) --------------------------
ALTER TYPE "listing_status" ADD VALUE 'sold' BEFORE 'archived';

-- 2. Seller-declared sold timestamp (nullable; server-owned) -----------------
ALTER TABLE "listings" ADD COLUMN "sold_at" TIMESTAMPTZ(6);
