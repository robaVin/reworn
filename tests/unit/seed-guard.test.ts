import { describe, it, expect } from 'vitest';
import {
  assertSeedAllowed,
  SeedNotAllowedError,
} from '../../prisma/seed-guard';

const LOCAL_DB = 'postgresql://postgres:postgres@localhost:5432/reworn';
const SUPABASE_DB =
  'postgresql://postgres.ref:pw@aws-0-eu.pooler.supabase.com:6543/postgres';

describe('seed production guard', () => {
  it('allows seeding in development against a local database', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: LOCAL_DB }),
    ).not.toThrow();
  });

  it('allows seeding in test against a local database', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'test', DATABASE_URL: LOCAL_DB }),
    ).not.toThrow();
  });

  it('REFUSES seeding in production', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'production', DATABASE_URL: LOCAL_DB }),
    ).toThrow(SeedNotAllowedError);
  });

  it('REFUSES seeding a hosted Supabase database even in development', () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: 'development', DATABASE_URL: SUPABASE_DB }),
    ).toThrow(SeedNotAllowedError);
  });

  it('permits production seeding only with the explicit override', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'production',
        DATABASE_URL: LOCAL_DB,
        ALLOW_PRODUCTION_SEED: 'true',
      }),
    ).not.toThrow();
  });

  it('permits a hosted database only with the explicit override', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: SUPABASE_DB,
        ALLOW_PRODUCTION_SEED: 'true',
      }),
    ).not.toThrow();
  });

  it('defaults to development when NODE_ENV is unset', () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: LOCAL_DB })).not.toThrow();
  });

  it('does not treat a localhost URL as production', () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      }),
    ).not.toThrow();
  });
});
