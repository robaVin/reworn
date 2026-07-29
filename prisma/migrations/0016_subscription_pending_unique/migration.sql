-- =============================================================================
-- 0016 -- At most one PENDING subscription per seller (Increment 4A)
-- =============================================================================
-- Forward-only. Complements the existing "one live subscription per seller"
-- partial unique (migration 0002) with a second partial unique that permits at
-- most one PENDING subscription per seller.
--
-- This makes `createPendingSubscription` idempotent and race-safe WITHOUT an
-- application-level find-then-insert: two concurrent purchase initiations for
-- the same seller cannot both create a pending row -- the second INSERT violates
-- this index and its transaction rolls back, and the service returns the winning
-- pending subscription. A seller may still hold a live subscription (active /
-- grace) AND one pending row (a queued renewal) at the same time -- the two
-- partial indexes cover disjoint status sets.
--
-- Like `ux_one_live_subscription_per_seller`, this is a PARTIAL index that the
-- Prisma schema cannot express; it lives in raw SQL and is owned by this
-- migration. The workflow is `prisma migrate deploy` only -- never `migrate dev`.
--
-- ASCII-only by policy (files are read as WIN1252 by the Windows toolchain).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS "ux_one_pending_subscription_per_seller"
  ON "subscriptions" ("seller_id")
  WHERE "status" = 'pending';
