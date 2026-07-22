import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { registerSchema } from '@/modules/auth/schemas';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/register
 *
 * Creates a Supabase Auth user (email/password). Security posture:
 *  - Supabase is the sole authentication authority; we store no password.
 *  - The response is ENUMERATION-SAFE: it is identical whether or not the email
 *    already exists, so an attacker cannot probe for registered accounts.
 *  - NO seller/admin privileges are granted here. Any role field in the body is
 *    ignored (the schema does not accept one). The application profile + default
 *    buyer role are provisioned idempotently on first successful login.
 *  - Optional `displayName` is stored as Auth user metadata and applied during
 *    first-login provisioning only (never overwrites an existing profile).
 *  - Terms acceptance is validated in the browser for UX. Durable legal consent
 *    recording is DEFERRED — this route does not claim or persist a consent
 *    ledger.
 *  - Rate limiting is applied by middleware for /api/auth/*.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    // Only non-enumerating validation feedback (e.g. password length).
    return NextResponse.json(
      {
        error:
          'Please provide a valid email and a password of at least 8 characters.',
      },
      { status: 400 },
    );
  }

  const { email, password, displayName } = parsed.data;
  const supabase = await createSupabaseUserClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/api/auth/callback`,
      data: displayName ? { display_name: displayName } : undefined,
    },
  });

  if (error) {
    // Log the real reason (redacted), return a generic, enumeration-safe message.
    logger.warn('registration error', { reason: error.message });
  }

  // Identical response on success, duplicate email, or benign error.
  return NextResponse.json({
    message:
      'If those details are valid, check your email to verify your account.',
  });
}
