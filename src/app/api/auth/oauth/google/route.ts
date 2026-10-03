import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/oauth/google
 *
 * Starts the Google OAuth redirect via Supabase. No client-held secrets.
 * If Supabase is not configured, or the provider is unavailable, redirects
 * to a truthful login error — never a simulated success.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  // Canonical PUBLIC origin for every absolute URL we hand to the browser or to
  // Supabase — never request.nextUrl.origin, which is `localhost` on Amplify's
  // SSR compute and would otherwise be where the user lands after OAuth.
  const base = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const next = safeRedirectPath(searchParams.get('next'), '/');

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL('/login?error=config', base));
  }

  const supabase = await createSupabaseUserClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${base}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    logger.warn('google oauth start failed', {
      reason: error?.message ?? 'no_url',
    });
    return NextResponse.redirect(new URL('/login?error=oauth', base));
  }

  return NextResponse.redirect(data.url);
}
