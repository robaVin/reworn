/**
 * Global test setup.
 *
 * Provides deterministic, non-production environment values so that modules
 * validating configuration at import time (src/lib/env.ts) can load safely.
 * These are fake values used only by the test runner — never real secrets.
 */

import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';

/**
 * Global next-intl mock for component/unit tests.
 *
 * Components now resolve UI copy through next-intl. In the node test harness
 * there is no request/provider context, so `getTranslations`/`useTranslations`
 * are mocked to return a translator backed by the REAL English catalog
 * (messages/en.json). Rendered components therefore show the actual English
 * strings, and existing assertions on English text keep passing — while the
 * en/sq/mk catalogs and their parity are validated separately in i18n.test.ts.
 */
const intl = await vi.hoisted(async () => {
  const EN = (await import('../messages/en.json')).default as Record<
    string,
    unknown
  >;
  const resolve = (ns: string | undefined, key: string): unknown => {
    const base = (ns ? (EN[ns] as Record<string, unknown>) : EN) ?? {};
    return key
      .split('.')
      .reduce<unknown>(
        (o, k) =>
          o && typeof o === 'object'
            ? (o as Record<string, unknown>)[k]
            : undefined,
        base,
      );
  };
  const makeT = (ns?: string) => {
    const t = (key: string, values?: Record<string, unknown>): string => {
      const v = resolve(ns, key);
      if (typeof v !== 'string') return key;
      return values
        ? v.replace(/\{(\w+)\}/g, (_, p) => String(values[p] ?? `{${p}}`))
        : v;
    };
    // Minimal t.rich for tests: drop tag markup, keep inner text.
    t.rich = (key: string): string => {
      const v = resolve(ns, key);
      return typeof v === 'string' ? v.replace(/<\/?[a-zA-Z]+>/g, '') : key;
    };
    t.has = (key: string): boolean => typeof resolve(ns, key) === 'string';
    return t;
  };
  return { EN, makeT };
});

vi.mock('next-intl', () => ({
  useTranslations: (ns?: string) => intl.makeT(ns),
  useLocale: () => 'en',
  NextIntlClientProvider: ({ children }: { children: unknown }) => children,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (arg?: string | { namespace?: string }) =>
    intl.makeT(typeof arg === 'string' ? arg : arg?.namespace),
  getLocale: async () => 'en',
  getMessages: async () => intl.EN,
}));

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
// Tests exercise the development bridge (enforcement off) so the listing
// publish path is reachable; specific tests assert both modes explicitly.
process.env.SUBSCRIPTION_ENFORCEMENT =
  process.env.SUBSCRIPTION_ENFORCEMENT ?? 'false';

process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';

// Scheduled-job trigger secret (fixed test value) so the cron route's auth
// guard can be exercised.
process.env.CRON_SECRET =
  process.env.CRON_SECRET ?? 'test-cron-secret-0123456789abcdef';
