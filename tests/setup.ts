/**
 * Global test setup.
 *
 * Provides deterministic, non-production environment values so that modules
 * validating configuration at import time (src/lib/env.ts) can load safely.
 * These are fake values used only by the test runner — never real secrets.
 */

// NODE_ENV is set to 'test' by Vitest itself and is read-only in @types/node.
process.env.NEXT_PUBLIC_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://test-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'test-service-role-key';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://test:test@localhost:5432/test?schema=public';
process.env.DIRECT_URL =
  process.env.DIRECT_URL ??
  'postgresql://test:test@localhost:5432/test?schema=public';

// Payments: tests exercise the mock gateway only. The real adapter stays
// disabled — no bank documentation or credentials exist yet.
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER ?? 'mock';
process.env.PAYMENT_CURRENCY = process.env.PAYMENT_CURRENCY ?? 'MKD';
process.env.CASYS_ENABLED = 'false';

process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS =
  process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS ?? '7';
process.env.SUBSCRIPTION_TRIAL_ENABLED =
  process.env.SUBSCRIPTION_TRIAL_ENABLED ?? 'false';

process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';
