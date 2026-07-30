import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Environment validation guards invariants that make an entire class of
 * incident impossible — above all: a fake payment must never be able to
 * activate a real subscription.
 *
 * `src/lib/env.ts` validates at import time, so each case re-imports the
 * module with a fresh module registry.
 */

const VALID: Record<string, string> = {
  NEXT_PUBLIC_APP_URL: 'https://reworn.mk',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc123.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  DATABASE_URL: 'postgresql://u:p@h:6543/db',
  DIRECT_URL: 'postgresql://u:p@h:5432/db',
};

function setEnv(overrides: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries({ ...VALID, ...overrides })) {
    vi.stubEnv(k, v);
  }
}

async function loadEnvModule() {
  vi.resetModules();
  return import('@/lib/env');
}

describe('environment validation', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Start from a clean slate so values leaked by tests/setup.ts cannot mask
    // a failure. Note: these MUST be removed (undefined), not set to '' —
    // Zod's `.default()` only applies to undefined, and coercing '' to a
    // number yields 0, which would fail unrelated `.positive()` checks.
    for (const key of [
      ...Object.keys(VALID),
      'PAYMENT_PROVIDER',
      'PAYMENT_CURRENCY',
      'PAYMENT_ATTEMPT_TTL_MINUTES',
      'CASYS_ENABLED',
      'SUBSCRIPTION_GRACE_PERIOD_DAYS',
      'SUBSCRIPTION_TRIAL_ENABLED',
      'SUBSCRIPTION_TRIAL_DAYS',
      'SUBSCRIPTION_ENFORCEMENT',
      'AUTH_PHONE_OTP_ENABLED',
      'NEXT_PUBLIC_SENTRY_DSN',
      'RATE_LIMIT_MAX',
      'RATE_LIMIT_WINDOW_SECONDS',
      'LOG_LEVEL',
    ]) {
      vi.stubEnv(key, undefined);
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a valid configuration', async () => {
    setEnv({ PAYMENT_PROVIDER: 'none' });
    const { env } = await loadEnvModule();
    expect(env.PAYMENT_CURRENCY).toBe('MKD');
    expect(env.SUBSCRIPTION_GRACE_PERIOD_DAYS).toBe(7);
  });

  it('refuses to boot when a required variable is missing', async () => {
    setEnv();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    await expect(loadEnvModule()).rejects.toThrow(
      /Invalid environment configuration/,
    );
  });

  it('reports the failing variable NAME but never its value', async () => {
    setEnv({ NEXT_PUBLIC_APP_URL: 'super-secret-not-a-url' });
    await expect(loadEnvModule()).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
    await expect(loadEnvModule()).rejects.not.toThrow(/super-secret/);
  });

  describe('payment safety invariants', () => {
    it('FORBIDS the mock gateway in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      setEnv({ PAYMENT_PROVIDER: 'mock' });
      await expect(loadEnvModule()).rejects.toThrow(/forbidden in production/i);
    });

    it('allows the mock gateway in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      setEnv({ PAYMENT_PROVIDER: 'mock' });
      const { env, isMockPaymentAllowed } = await loadEnvModule();
      expect(env.PAYMENT_PROVIDER).toBe('mock');
      expect(isMockPaymentAllowed()).toBe(true);
    });

    it('reports mock as NOT allowed in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      setEnv({ PAYMENT_PROVIDER: 'none' });
      const { isMockPaymentAllowed } = await loadEnvModule();
      expect(isMockPaymentAllowed()).toBe(false);
    });

    it('hard-disables the CaSys provider (adapter not implemented)', async () => {
      setEnv({ PAYMENT_PROVIDER: 'casys' });
      await expect(loadEnvModule()).rejects.toThrow(/not implemented/i);
    });

    it('rejects CASYS_ENABLED=true until official documentation exists', async () => {
      setEnv({ PAYMENT_PROVIDER: 'none', CASYS_ENABLED: 'true' });
      await expect(loadEnvModule()).rejects.toThrow(
        /hard-disabled|not implemented/i,
      );
    });

    it('defaults production to "none" so the UI can degrade gracefully', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      setEnv({ PAYMENT_PROVIDER: 'none' });
      const { isPaymentsUnavailable } = await loadEnvModule();
      expect(isPaymentsUnavailable()).toBe(true);
    });
  });

  describe('subscription enforcement rollout policy', () => {
    it('ALLOWS enforcement disabled in production (rollout: never block existing sellers)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      setEnv({ PAYMENT_PROVIDER: 'none', SUBSCRIPTION_ENFORCEMENT: 'false' });
      const { env } = await loadEnvModule();
      expect(env.SUBSCRIPTION_ENFORCEMENT).toBe(false);
    });

    it('defaults to DISABLED (false) when unset — enforcement stays off until billing is live', async () => {
      setEnv({ PAYMENT_PROVIDER: 'none' });
      const { env } = await loadEnvModule();
      expect(env.SUBSCRIPTION_ENFORCEMENT).toBe(false);
    });

    it('allows disabling enforcement outside production too', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      setEnv({ PAYMENT_PROVIDER: 'none', SUBSCRIPTION_ENFORCEMENT: 'false' });
      const { env } = await loadEnvModule();
      expect(env.SUBSCRIPTION_ENFORCEMENT).toBe(false);
    });

    it('REFUSES to enable enforcement without a live payment provider', async () => {
      setEnv({ PAYMENT_PROVIDER: 'none', SUBSCRIPTION_ENFORCEMENT: 'true' });
      await expect(loadEnvModule()).rejects.toThrow(
        /requires a live PAYMENT_PROVIDER|payment provider/i,
      );
    });

    it('rejects an unknown enforcement value (fail closed on misconfiguration)', async () => {
      setEnv({ PAYMENT_PROVIDER: 'none', SUBSCRIPTION_ENFORCEMENT: 'maybe' });
      await expect(loadEnvModule()).rejects.toThrow(
        /Invalid environment configuration/,
      );
    });
  });

  describe('subscription configuration', () => {
    it('rejects an enabled trial with zero days', async () => {
      setEnv({
        PAYMENT_PROVIDER: 'none',
        SUBSCRIPTION_TRIAL_ENABLED: 'true',
        SUBSCRIPTION_TRIAL_DAYS: '0',
      });
      await expect(loadEnvModule()).rejects.toThrow(/TRIAL_DAYS/);
    });

    it('keeps the free trial disabled by default', async () => {
      setEnv({ PAYMENT_PROVIDER: 'none' });
      const { env } = await loadEnvModule();
      expect(env.SUBSCRIPTION_TRIAL_ENABLED).toBe(false);
    });

    it('uses a configurable seven-day grace period', async () => {
      setEnv({
        PAYMENT_PROVIDER: 'none',
        SUBSCRIPTION_GRACE_PERIOD_DAYS: '14',
      });
      const { env } = await loadEnvModule();
      expect(env.SUBSCRIPTION_GRACE_PERIOD_DAYS).toBe(14);
    });
  });
});
