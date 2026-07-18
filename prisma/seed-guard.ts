/**
 * Seed safety guard.
 *
 * Development seeds create roles, provisional plans and sample categories.
 * Running them against production could overwrite or pollute real data, so the
 * guard makes that IMPOSSIBLE BY ACCIDENT: seeding is refused in production
 * unless an explicit, deliberate override is set.
 *
 * Extracted from seed.ts so the decision logic is unit-testable without a
 * database connection.
 */

export interface SeedEnv {
  NODE_ENV?: string;
  /** Deliberate, documented override. Never set in normal operation. */
  ALLOW_PRODUCTION_SEED?: string;
  /** Guards against pointing a seed at a production-looking database. */
  DATABASE_URL?: string;
}

export class SeedNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedNotAllowedError';
  }
}

/**
 * Throws SeedNotAllowedError unless seeding is clearly safe.
 * Returns normally (void) when seeding is permitted.
 */
export function assertSeedAllowed(env: SeedEnv): void {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const override = env.ALLOW_PRODUCTION_SEED === 'true';

  if (nodeEnv === 'production' && !override) {
    throw new SeedNotAllowedError(
      'Refusing to seed in production. Seeds are for development only. ' +
        'If you truly intend this, set ALLOW_PRODUCTION_SEED="true" — but this ' +
        'is almost never correct.',
    );
  }

  // Secondary heuristic: a pooled Supabase production URL should not be seeded
  // even outside NODE_ENV=production (e.g. a mislabelled shell). Block obvious
  // production hostnames unless explicitly overridden.
  const url = env.DATABASE_URL ?? '';
  const looksProd =
    /supabase\.(co|com)/i.test(url) && !/localhost|127\.0\.0\.1/i.test(url);
  if (looksProd && !override) {
    throw new SeedNotAllowedError(
      'DATABASE_URL points at a hosted Supabase database. Seeding is blocked ' +
        'to protect real data. Use a local database, or set ' +
        'ALLOW_PRODUCTION_SEED="true" if this is an intentional staging seed.',
    );
  }
}
