import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { provisionProfile } from '@/modules/auth/provisioning';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

/**
 * GET /api/auth/callback
 *
 * Handles:
 *  1. OAuth (Google) code exchange
 *  2. Email-verification link returns
 *  3. Password-recovery link returns (`next` should be `/reset-password`)
 *
 * Recovery is distinguished by the safe `next` destination (`/reset-password`),
 * not by inventing token-type parsing. After a recovery exchange the user has
 * a short-lived authenticated session used only to call updateUser(password).
 *
 * The `next` destination is reduced to a safe internal path to prevent an open
 * redirect through the callback.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'), '/');
  const isRecovery = next === '/reset-password';

  if (!code) {
    const fail = isRecovery
      ? '/reset-password?error=expired'
      : '/login?error=auth';
    return NextResponse.redirect(new URL(fail, origin));
  }

  const supabase = await createSupabaseUserClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    logger.warn('auth callback exchange failed', {
      reason: error?.message ?? 'no_user',
      recovery: isRecovery,
    });
    const fail = isRecovery
      ? '/reset-password?error=expired'
      : '/login?error=auth';
    return NextResponse.redirect(new URL(fail, origin));
  }

  // Provision on OAuth / email-verify first login. Harmless (idempotent) on
  // recovery sessions for existing users.
  try {
    const meta = data.user.user_metadata as { display_name?: unknown } | null;
    const displayName =
      typeof meta?.display_name === 'string' ? meta.display_name : null;
    await provisionProfile(data.user.id, { displayName });
  } catch (e) {
    logger.error('provisioning after auth callback failed', {
      userId: data.user.id,
      error: e,
    });
  }

  return NextResponse.redirect(new URL(next, origin));
}
