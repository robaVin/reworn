import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Session refresh for Edge middleware.
 *
 * Rotates the Supabase access token using the refresh token and writes the
 * updated cookies onto the outgoing response. This keeps sessions alive across
 * requests WITHOUT being an authorization layer: every protected route and
 * mutation still independently verifies the user server-side.
 *
 * Guarded: if Supabase is not configured (e.g. the Stage 1 shell running with
 * no .env.local), it is a no-op so the app still boots.
 */
export async function refreshSession(
  request: NextRequest,
  response: NextResponse,
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the JWT with the Auth server and triggers a refresh if
  // needed; the refreshed cookies are written to `response` via setAll above.
  try {
    await supabase.auth.getUser();
  } catch {
    // Never let a transient auth-server hiccup break the whole request.
  }
}
