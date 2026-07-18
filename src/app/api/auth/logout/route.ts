import { NextResponse } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/logout
 *
 *  - Invalidates the current Supabase session and clears auth cookies (the SSR
 *    client removes them via its cookie handler).
 *  - Always returns a safe, identical result — even if there was no session —
 *    so it never leaks whether a token previously existed.
 *
 * Global "sign out of all devices" is a documented FUTURE enhancement
 * (Supabase `signOut({ scope: 'global' })`); this increment signs out the
 * current session only.
 */
export async function POST(): Promise<Response> {
  try {
    const supabase = await createSupabaseUserClient();
    await supabase.auth.signOut();
  } catch {
    // Idempotent: an already-invalid or missing session is still a clean logout.
  }
  return NextResponse.json({ ok: true });
}
