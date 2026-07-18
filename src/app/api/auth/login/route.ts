import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { loginSchema } from '@/modules/auth/schemas';
import { provisionProfile } from '@/modules/auth/provisioning';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/login  (email + password)
 *
 *  - Generic invalid-credentials response (no account enumeration).
 *  - Rate limited by middleware for /api/auth/*.
 *  - On success, provisions the application profile idempotently (also covers
 *    a first login after email verification, or recovery from a prior partial
 *    provisioning failure).
 *  - Returns a SAFE redirect target: any client-supplied `redirectTo` is reduced
 *    to an internal relative path, preventing open redirects.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid email or password.' },
      { status: 401 },
    );
  }

  const { email, password, redirectTo } = parsed.data;
  const supabase = await createSupabaseUserClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    logger.warn('login failed', { reason: error?.message ?? 'no_user' });
    // Same message for wrong password, unknown email, unconfirmed account.
    return NextResponse.json(
      { error: 'Invalid email or password.' },
      { status: 401 },
    );
  }

  // Idempotent, concurrency-safe provisioning against the verified user id.
  try {
    await provisionProfile(data.user.id);
  } catch (e) {
    // Auth succeeded but provisioning failed: do not block login. Provisioning
    // is idempotent and will re-converge on the next authenticated action.
    logger.error('provisioning after login failed', {
      userId: data.user.id,
      error: e,
    });
  }

  return NextResponse.json({
    redirectTo: safeRedirectPath(redirectTo, '/'),
  });
}
