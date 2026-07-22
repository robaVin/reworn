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
  const { searchParams, origin } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get('next'), '/');

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL('/login?error=config', origin));
  }

  const supabase = await createSupabaseUserClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? origin;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    logger.warn('google oauth start failed', {
      reason: error?.message ?? 'no_url',
    });
    return NextResponse.redirect(new URL('/login?error=oauth', origin));
  }

  return NextResponse.redirect(data.url);
}
