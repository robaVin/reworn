-- =============================================================================
-- 0004 — Scoped RLS policies (Increment #5)
-- =============================================================================
-- Replaces pure deny-by-default with the MINIMUM scoped policies auth needs,
-- while keeping deny-by-default for everything not explicitly allowed.
--
-- Portability: instead of depending on Supabase's `auth.uid()`, we define our
-- own JWT-claim helpers in `public`. They read the same GUC Supabase/PostgREST
-- set (`request.jwt.claims`), so policies behave identically on Supabase and on
-- a plain Postgres used by CI/tests (where the test harness sets the GUC and
-- SET ROLE authenticated).
--
-- Two-layer enforcement recap:
--   1. TABLE GRANTS decide which verbs a role may even attempt.
--   2. RLS POLICIES decide which rows. No INSERT/UPDATE/DELETE grants are given
--      to anon/authenticated on protected tables (except a column-scoped UPDATE
--      on profiles), so user-driven writes are impossible regardless of policy.
--   The privileged server path (Prisma / service role, BYPASSRLS) performs all
--   controlled writes and is separately authorized + audited in the app.
-- =============================================================================

-- 0. Ensure the Supabase-style roles exist (no-ops on Supabase; created on a
--    plain Postgres so tests can SET ROLE authenticated / anon).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 1. JWT-claim helpers -------------------------------------------------------
-- The verified user id from the request JWT (NULL when absent).
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

-- Whether the current user has the admin role. SECURITY DEFINER so it can read
-- user_roles without recursing through that table's own RLS.
CREATE OR REPLACE FUNCTION public.current_app_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.profile_id = public.current_app_user_id()
      AND r.name = 'admin'
  )
$$;

REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_is_admin() TO anon, authenticated;

-- 2. Deterministic baseline grants ------------------------------------------
-- Start from zero on every protected table, then grant back the minimum.
REVOKE ALL ON
  profiles, roles, user_roles, seller_profiles, listing_usage,
  subscription_plans, subscriptions, subscription_events,
  payment_attempts, payment_events, categories, audit_logs
FROM anon, authenticated;

-- Reads (RLS still filters rows): authenticated may attempt SELECT broadly;
-- anon only on the public catalogue.
GRANT SELECT ON
  profiles, roles, user_roles, seller_profiles,
  subscription_plans, subscriptions,
  payment_attempts, payment_events, subscription_events,
  categories, audit_logs
TO authenticated;

GRANT SELECT ON subscription_plans, categories TO anon;

-- The ONLY user-driven write allowed anywhere: self-service profile fields.
-- Column-scoped, so identity/status/role columns are untouchable this way.
GRANT UPDATE (display_name, avatar_url, locale) ON profiles TO authenticated;

-- 3. Policies ----------------------------------------------------------------
-- profiles
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated
  USING (id = public.current_app_user_id());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = public.current_app_user_id())
  WITH CHECK (id = public.current_app_user_id());

CREATE POLICY "profiles_admin_select" ON profiles
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- roles catalogue (needed so the user_roles -> roles join is visible)
CREATE POLICY "roles_select_authenticated" ON roles
  FOR SELECT TO authenticated
  USING (true);

-- user_roles: read own; admins read all. No write policies (deny-by-default).
CREATE POLICY "user_roles_select_own" ON user_roles
  FOR SELECT TO authenticated
  USING (profile_id = public.current_app_user_id());

CREATE POLICY "user_roles_admin_select" ON user_roles
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- seller_profiles: owner reads own; admins read all. No self-create/approve.
CREATE POLICY "seller_profiles_select_own" ON seller_profiles
  FOR SELECT TO authenticated
  USING (profile_id = public.current_app_user_id());

CREATE POLICY "seller_profiles_admin_select" ON seller_profiles
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- subscription_plans: public reads active plans; admins read all.
CREATE POLICY "plans_select_active_anon" ON subscription_plans
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "plans_select_active_auth" ON subscription_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "plans_admin_select" ON subscription_plans
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- categories: public reads active categories.
CREATE POLICY "categories_select_active_anon" ON categories
  FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "categories_select_active_auth" ON categories
  FOR SELECT TO authenticated
  USING (is_active = true);

-- subscriptions: seller owner reads own; admins read all. No user writes.
CREATE POLICY "subscriptions_select_own" ON subscriptions
  FOR SELECT TO authenticated
  USING (
    seller_id IN (
      SELECT id FROM seller_profiles
      WHERE profile_id = public.current_app_user_id()
    )
  );

CREATE POLICY "subscriptions_admin_select" ON subscriptions
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- payment_attempts: payer reads own; admins read all. No user writes.
CREATE POLICY "payment_attempts_select_own" ON payment_attempts
  FOR SELECT TO authenticated
  USING (profile_id = public.current_app_user_id());

CREATE POLICY "payment_attempts_admin_select" ON payment_attempts
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- Financial event logs + audit logs: admin read only; never user-writable.
CREATE POLICY "payment_events_admin_select" ON payment_events
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

CREATE POLICY "subscription_events_admin_select" ON subscription_events
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

CREATE POLICY "audit_logs_admin_select" ON audit_logs
  FOR SELECT TO authenticated
  USING (public.current_app_is_admin());

-- listing_usage intentionally has NO policies yet (quota is Increment #6):
-- it remains deny-by-default for anon/authenticated.
