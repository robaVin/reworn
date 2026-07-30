import 'server-only';
import { z } from 'zod';

/**
 * Environment validation — fail fast, fail loudly.
 *
 * The application refuses to boot if configuration is missing or unsafe.
 * This module is `server-only`: importing it from a Client Component is a
 * build error, so server secrets can never be bundled for the browser.
 *
 * Public values (NEXT_PUBLIC_*) are inlined by Next.js at build time and may
 * be read directly in client code; they are safe only because Row-Level
 * Security is deny-by-default.
 */

const nonEmpty = (name: string) =>
  z.string().min(1, `${name} must not be empty`);

const booleanish = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    NEXT_PUBLIC_APP_URL: z.string().url('NEXT_PUBLIC_APP_URL must be a URL'),

    // --- Supabase ---
    NEXT_PUBLIC_SUPABASE_URL: z
      .string()
      .url('NEXT_PUBLIC_SUPABASE_URL must be a URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    /** Bypasses RLS. Server-only. Never expose. */
    SUPABASE_SERVICE_ROLE_KEY: nonEmpty('SUPABASE_SERVICE_ROLE_KEY'),

    // --- Database ---
    DATABASE_URL: nonEmpty('DATABASE_URL'),
    DIRECT_URL: nonEmpty('DIRECT_URL'),

    // --- Auth ---
    AUTH_PHONE_OTP_ENABLED: booleanish,

    // --- Payments ---
    PAYMENT_PROVIDER: z.enum(['mock', 'casys', 'none']).default('none'),
    PAYMENT_CURRENCY: z
      .string()
      .length(3, 'PAYMENT_CURRENCY must be an ISO-4217 code')
      .default('MKD'),
    PAYMENT_ATTEMPT_TTL_MINUTES: z.coerce.number().int().positive().default(30),
    CASYS_ENABLED: booleanish,

    // --- Subscriptions ---
    SUBSCRIPTION_GRACE_PERIOD_DAYS: z.coerce
      .number()
      .int()
      .min(0)
      .max(90)
      .default(7),
    SUBSCRIPTION_TRIAL_ENABLED: booleanish,
    SUBSCRIPTION_TRIAL_DAYS: z.coerce.number().int().min(0).default(0),
    /**
     * Whether publishing a listing requires a live seller subscription.
     *
     * ROLLOUT POLICY (Increment 4A follow-up): enforcement stays DISABLED until
     * checkout + webhook activation are production-ready, so an incomplete
     * billing rollout never blocks existing sellers. It therefore DEFAULTS to
     * `false` and is permitted to be `false` in ANY environment, including
     * production. To ENABLE it a live payment provider is required (see
     * superRefine) — enforcing a paid subscription with no way to pay would lock
     * every seller out. Only the enum is accepted, so an unknown value fails the
     * build (fail closed on misconfiguration). Evaluated ONLY on the server.
     */
    SUBSCRIPTION_ENFORCEMENT: z
      .enum(['true', 'false'])
      .default('false')
      .transform((s) => s === 'true'),

    // --- Monitoring / logging ---
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional().or(z.literal('')),
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error'])
      .default('info'),

    // --- Rate limiting ---
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  })
  .superRefine((v, ctx) => {
    /* ------------------------------------------------------------------
     * Payment safety invariants.
     *
     * These exist to make an entire class of incident impossible:
     * a fake payment must never be able to activate a real subscription.
     *
     * They target production RUNTIME, not the build step. `next build` sets
     * NODE_ENV=production but does not run the app; these server-only values
     * are read at request time, not baked into the bundle. Skipping the checks
     * during the build phase lets a developer build locally with a dev bridge
     * in .env, while a real production server (not the build phase) still
     * refuses to start with an unsafe configuration.
     * ---------------------------------------------------------------- */
    const isProdRuntime =
      v.NODE_ENV === 'production' &&
      process.env.NEXT_PHASE !== 'phase-production-build';

    // 1. The mock gateway is a development tool. In production it would let
    //    anyone mint a free subscription. Refuse to boot.
    if (isProdRuntime && v.PAYMENT_PROVIDER === 'mock') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_PROVIDER'],
        message:
          'PAYMENT_PROVIDER="mock" is forbidden in production. A mock payment ' +
          'must never activate a real subscription. Use "none" until the bank ' +
          'gateway is configured.',
      });
    }

    // 1b. Subscription-enforcement rollout coherence. Enforcement stays disabled
    //     until billing is live (rollout policy), so `false` is permitted in
    //     every environment — an incomplete rollout must never block existing
    //     sellers. But ENABLING enforcement without a live payment provider would
    //     lock every seller out (a paid subscription with no way to pay), so
    //     `SUBSCRIPTION_ENFORCEMENT=true` requires a real provider. Since `mock`
    //     is prod-forbidden and `casys` is hard-disabled (below), turning
    //     enforcement on today is only possible once a real gateway is wired —
    //     which is exactly the activation gate. Fail closed on this misconfig.
    if (v.SUBSCRIPTION_ENFORCEMENT === true && v.PAYMENT_PROVIDER === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUBSCRIPTION_ENFORCEMENT'],
        message:
          'SUBSCRIPTION_ENFORCEMENT="true" requires a live PAYMENT_PROVIDER ' +
          '(not "none"). Keep enforcement disabled until checkout and webhook ' +
          'activation are live; enabling it with no payment provider would lock ' +
          'every seller out.',
      });
    }

    // 2. The CaSys adapter is an empty integration boundary. No official bank
    //    documentation, signing rules, endpoints or credentials exist yet, so
    //    selecting it cannot possibly work. Fail clearly instead of obscurely.
    if (v.PAYMENT_PROVIDER === 'casys' || v.CASYS_ENABLED) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PAYMENT_PROVIDER'],
        message:
          'The CaSys adapter is not implemented and is hard-disabled. It ' +
          'remains blocked until the bank supplies official documentation, ' +
          'signing rules, endpoints, sandbox credentials, test cards and ' +
          'merchant credentials. Set PAYMENT_PROVIDER="none".',
      });
    }

    // 3. A trial that is enabled but zero-length is a silent misconfiguration.
    if (v.SUBSCRIPTION_TRIAL_ENABLED && v.SUBSCRIPTION_TRIAL_DAYS <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SUBSCRIPTION_TRIAL_DAYS'],
        message:
          'SUBSCRIPTION_TRIAL_DAYS must be > 0 when SUBSCRIPTION_TRIAL_ENABLED ' +
          'is true.',
      });
    }
  });

export type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    // Report the variable NAMES that failed — never their values.
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        'See .env.example. The application will not start with an unsafe or ' +
        'incomplete configuration.',
    );
  }

  return parsed.data;
}

export const env: Env = loadEnv();

/** True only where a fake payment can do no real harm. */
export const isMockPaymentAllowed = (): boolean =>
  env.NODE_ENV !== 'production' && env.PAYMENT_PROVIDER === 'mock';

/** True when no usable gateway is configured (production default for now). */
export const isPaymentsUnavailable = (): boolean =>
  env.PAYMENT_PROVIDER === 'none';
