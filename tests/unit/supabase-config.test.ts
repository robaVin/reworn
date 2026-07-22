import { afterEach, describe, expect, it } from 'vitest';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/**
 * Configuration gate for truthful auth UI — never treats placeholders or
 * junk as a live Supabase project.
 */
describe('isSupabaseConfigured', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
  });

  it('returns false when either public value is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('returns false for .env.example placeholder values', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://YOUR-PROJECT-REF.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      'REPLACE_WITH_SUPABASE_ANON_KEY';
    expect(isSupabaseConfigured()).toBe(false);
  });

  it('returns true for a plausible https project URL + key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      'https://abcdefghijklmnop.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    expect(isSupabaseConfigured()).toBe(true);
  });
});
