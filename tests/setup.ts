/**
 * Global test setup.
 *
 * Provides deterministic, non-production environment values so that modules
 * validating configuration at import time (src/lib/env.ts) can load safely.
 * These are fake values used only by the test runner — never real secrets.
 */

import { webcrypto } from 'node:crypto';

/**
 * Node 18 does not expose the Web Crypto API as a global without
 * `--experimental-global-webcrypto` (it became default in Node 19+).
 * Production runs on the Edge runtime and Node 20, where `crypto` is always
 * global, so this polyfill is TEST-ONLY and does not mask a real problem.
 *
 * It can be deleted once local development moves to Node 20 LTS.
 */
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

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
