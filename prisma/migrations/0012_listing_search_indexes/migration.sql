-- Public marketplace: weighted full-text search + published-only partial indexes
-- matched to the exact browse query shapes (predicate: status='published').

-- 1. Generated, weighted search vector. Uses the 'simple' config (no language
--    stemming) so it is language-agnostic (mixed EN/MK content) AND immutable:
--    a generated column requires an immutable expression, which the 2-arg
--    to_tsvector(regconfig, text) form satisfies.
--    Weights: title A, brand B, material C, description D.
ALTER TABLE "listings" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("brand", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce("material", '')), 'C') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'D')
  ) STORED;

CREATE INDEX "listings_search_gin" ON "listings" USING gin ("search_vector");

-- 2. Retire the speculative 2A indexes; the public path always filters
--    status='published', so partial indexes below are smaller and exact.
DROP INDEX IF EXISTS "listings_status_created_at_idx";
DROP INDEX IF EXISTS "listings_status_gender_idx";
DROP INDEX IF EXISTS "listings_status_price_minor_idx";
DROP INDEX IF EXISTS "listings_category_id_status_idx";

-- 3. Keyset/sort/filter indexes, PARTIAL on published (the only public rows).
--    id is the final, deterministic tiebreaker in each ordering.
CREATE INDEX "listings_pub_created_idx"
  ON "listings" ("created_at" DESC, "id" DESC)
  WHERE "status" = 'published';

CREATE INDEX "listings_pub_price_idx"
  ON "listings" ("price_minor" ASC, "id" ASC)
  WHERE "status" = 'published';

CREATE INDEX "listings_pub_category_created_idx"
  ON "listings" ("category_id", "created_at" DESC, "id" DESC)
  WHERE "status" = 'published';

-- 4. Normalized location (lower + trimmed + collapsed whitespace) equality
--    filter. Immutable expression -> valid for a functional index. The app
--    normalizes the query value identically; this is exact normalized match
--    (city-level), not fuzzy search.
CREATE INDEX "listings_pub_location_idx"
  ON "listings" (lower(regexp_replace(btrim("location"), '\s+', ' ', 'g')))
  WHERE "status" = 'published' AND "location" IS NOT NULL;
