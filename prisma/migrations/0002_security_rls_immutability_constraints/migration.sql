-- =============================================================================
-- 0002 — Security: RLS, immutability, idempotency & integrity constraints
-- =============================================================================
-- Everything Prisma's schema language cannot express. Hand-authored and
-- reviewed. Idempotent where practical (IF NOT EXISTS / conditional blocks) so
-- it is safe to re-run and portable across a plain Postgres shadow DB and a
-- Supabase database.
--
-- Design authority: the APPLICATION BACKEND (via the Supabase service role,
-- which has BYPASSRLS) is the final authority on writes. RLS here is
-- DENY-BY-DEFAULT for the untrusted `anon` / `authenticated` roles: with RLS
-- enabled and no permissive policy, those roles get NOTHING. Fine-grained
-- read/write policies are added in the auth increment (0003+), on top of this
-- deny-by-default base.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Link application profiles to Supabase Auth users (conditionally).
--    Only added when the `auth` schema exists (i.e. on Supabase), so this
--    migration still applies on a plain Postgres shadow/CI database.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_id_auth_users_fkey'
  ) THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_id_auth_users_fkey"
      FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Data-integrity CHECK constraints (Prisma cannot express these).
-- -----------------------------------------------------------------------------
-- Money is non-negative minor units; currency is a 3-letter ISO-4217 code.
ALTER TABLE "subscription_plans"
  ADD CONSTRAINT "chk_plan_price_nonneg"      CHECK ("price_minor" >= 0),
  ADD CONSTRAINT "chk_plan_term_positive"     CHECK ("term_days" > 0),
  ADD CONSTRAINT "chk_plan_quota_nonneg"      CHECK ("weekly_listing_quota" >= 0),
  ADD CONSTRAINT "chk_plan_currency_iso"      CHECK (char_length("currency") = 3);

ALTER TABLE "payment_attempts"
  ADD CONSTRAINT "chk_attempt_amount_nonneg"  CHECK ("expected_amount_minor" >= 0),
  ADD CONSTRAINT "chk_attempt_currency_iso"   CHECK (char_length("expected_currency") = 3),
  ADD CONSTRAINT "chk_attempt_expiry_after"   CHECK ("expires_at" > "created_at");

ALTER TABLE "listing_usage"
  ADD CONSTRAINT "chk_usage_used_nonneg"      CHECK ("used" >= 0),
  ADD CONSTRAINT "chk_usage_quota_nonneg"     CHECK ("quota" >= 0),
  ADD CONSTRAINT "chk_usage_week_range"       CHECK ("iso_week" BETWEEN 1 AND 53),
  ADD CONSTRAINT "chk_usage_used_le_quota"    CHECK ("used" <= "quota");

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "chk_sub_period_order"
  CHECK ("current_period_end" IS NULL
      OR "current_period_start" IS NULL
      OR "current_period_end" > "current_period_start");

-- -----------------------------------------------------------------------------
-- 3. Idempotency & duplicate-protection (DATABASE-enforced, not app-only).
-- -----------------------------------------------------------------------------
-- (a) A provider event id, when present, may bind to only ONE attempt. This is
--     the hard guarantee that a repeated/replayed provider callback cannot be
--     processed twice, even under concurrency. (merchant_reference already has
--     a plain UNIQUE index from 0001.)
CREATE UNIQUE INDEX IF NOT EXISTS "ux_payment_attempts_provider_reference"
  ON "payment_attempts" ("provider_reference")
  WHERE "provider_reference" IS NOT NULL;

-- (b) A provider event id is globally unique across payment_events too, so the
--     same gateway callback cannot be recorded/acted on twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ux_payment_events_provider_event_id"
  ON "payment_events" ("provider_event_id")
  WHERE "provider_event_id" IS NOT NULL;

-- (c) DUPLICATE SUBSCRIPTION PERIOD PROTECTION: a seller may hold at most ONE
--     subscription that currently occupies the "live" slot (active or in grace).
--     Two concurrent verified callbacks therefore cannot both activate a
--     subscription for the same seller — the second INSERT/UPDATE violates this
--     index and its transaction rolls back. This is the DB backstop behind the
--     application's transactional activation (implemented in a later increment).
CREATE UNIQUE INDEX IF NOT EXISTS "ux_one_live_subscription_per_seller"
  ON "subscriptions" ("seller_id")
  WHERE "status" IN ('active', 'grace_period');

-- -----------------------------------------------------------------------------
-- 4. Immutability of financial / audit snapshots.
--    Content of a recorded event MUST NOT change. We block UPDATE outright via
--    a trigger (fires even for BYPASSRLS roles, so it cannot be sidestepped by
--    the service role). DELETE is intentionally NOT hard-blocked here: lawful
--    GDPR erasure cascades and retention purges must remain possible; DELETE is
--    instead governed by deny-by-default RLS + controlled server operations.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "reworn_block_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'Table % is append-only; UPDATE is not permitted', TG_TABLE_NAME
    USING ERRCODE = '0A000'; -- feature_not_supported
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_no_update" ON "subscription_events";
CREATE TRIGGER "trg_no_update" BEFORE UPDATE ON "subscription_events"
  FOR EACH ROW EXECUTE FUNCTION "reworn_block_update"();

DROP TRIGGER IF EXISTS "trg_no_update" ON "payment_events";
CREATE TRIGGER "trg_no_update" BEFORE UPDATE ON "payment_events"
  FOR EACH ROW EXECUTE FUNCTION "reworn_block_update"();

DROP TRIGGER IF EXISTS "trg_no_update" ON "audit_logs";
CREATE TRIGGER "trg_no_update" BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "reworn_block_update"();

-- -----------------------------------------------------------------------------
-- 5. Row-Level Security: DENY BY DEFAULT on every application table.
--    ENABLE + FORCE means the table owner is also subject to RLS; with no
--    permissive policy, the untrusted `anon` / `authenticated` roles can do
--    nothing. The server (service role, BYPASSRLS) performs all writes and is
--    the authorization authority. Fine-grained policies are layered on in the
--    auth increment.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles', 'roles', 'user_roles', 'seller_profiles', 'listing_usage',
    'subscription_plans', 'subscriptions', 'subscription_events',
    'payment_attempts', 'payment_events', 'categories', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    -- Belt and braces: no privileges to the anonymous browser role at all.
    -- (These roles exist on Supabase; guarded so the migration also runs on a
    --  plain Postgres shadow/CI database where they may not.)
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    END IF;
  END LOOP;
END $$;

-- No permissive policies are created in this migration. That is deliberate:
-- deny-by-default is the desired Stage 1 state. Read/write policies scoped to
-- the authenticated user, seller ownership, and admin role are introduced in
-- the authentication increment, each covered by RLS integration tests.
