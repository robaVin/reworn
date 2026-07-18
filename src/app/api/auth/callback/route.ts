import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { provisionProfile } from '@/modules/auth/provisioning';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/callback
 *
 * OAuth (Google) and email-verification return here with a `code`. We exchange
 * it for a session (server-side), then provision the application profile
 * idempotently — this is the FIRST-LOGIN provisioning point for OAuth users,
 * who never hit /register.
 *
 * The `next` destination is reduced to a safe internal path to prevent an open
 * redirect through the callback.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'), '/');

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth', origin));
  }

  const supabase = await createSupabaseUserClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    logger.warn('oauth callback exchange failed', {
      reason: error?.message ?? 'no_user',
    });
    return NextResponse.redirect(new URL('/login?error=auth', origin));
  }

  try {
    await provisionProfile(data.user.id);
  } catch (e) {
    logger.error('provisioning after oauth failed', {
      userId: data.user.id,
      error: e,
    });
  }

  return NextResponse.redirect(new URL(next, origin));
}
