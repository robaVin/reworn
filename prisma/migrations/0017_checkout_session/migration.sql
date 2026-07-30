-- =============================================================================
-- 0017 -- Checkout session state on payment attempts (Increment 4B)
-- =============================================================================
-- Forward-only. Adds the provider-hosted checkout URL to payment_attempts and a
-- partial unique so a pending subscription has AT MOST ONE open checkout attempt.
--
--   * `checkout_url` is the (non-secret) provider-hosted URL the seller is
--     redirected to. It is persisted so a repeated checkout initiation can REUSE
--     the still-open session instead of creating a new one. It is NEVER a
--     provider secret / API key / customer id.
--   * `ux_one_open_attempt_per_subscription` makes reuse race-safe WITHOUT an
--     application-level find-then-insert: for a given pending subscription only
--     one `pending` attempt can exist. Two concurrent initiations that both try
--     to persist an attempt for the same subscription collide on this index; the
--     loser reuses the winner's session. NULL subscription_id is exempt (SQL
--     NULLs distinct), so attempts not yet bound to a subscription are unaffected.
--
-- Raw partial index (Prisma cannot express it); owned by this migration.
-- `prisma migrate deploy` only -- never `migrate dev`.
--
-- ASCII-only by policy (files are read as WIN1252 by the Windows toolchain).
-- =============================================================================

-- AlterTable
ALTER TABLE "payment_attempts" ADD COLUMN "checkout_url" TEXT;

-- CreateIndex: at most one OPEN (pending) checkout attempt per subscription.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_one_open_attempt_per_subscription"
  ON "payment_attempts" ("subscription_id")
  WHERE "status" = 'pending' AND "subscription_id" IS NOT NULL;
