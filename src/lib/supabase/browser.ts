'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * BROWSER Supabase client.
 *
 * - Uses ONLY the public anon key (safe to ship to the browser precisely
 *   because Postgres RLS is deny-by-default).
 * - Used for browser-safe authenticated operations (e.g. initiating an OAuth
 *   redirect, reading the current session for UI state).
 * - It is NEVER an authorization boundary: any security decision is re-made on
 *   the server. Client-side role checks may only affect presentation.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase browser client is misconfigured: missing NEXT_PUBLIC_SUPABASE_URL ' +
        'or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return createBrowserClient(url, anonKey);
}
