import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { emailOnlySchema } from '@/modules/auth/schemas';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/forgot-password
 *
 * ENUMERATION-SAFE: always returns the same success body whether or not the
 * email exists. Rate limited by middleware for /api/auth/*.
 *
 * Recovery links return to /api/auth/callback?next=/reset-password so the
 * recovery session is established before the reset form.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = emailOnlySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please provide a valid email address.' },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const supabase = await createSupabaseUserClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });

  if (error) {
    logger.warn('forgot-password error', { reason: error.message });
  }

  return NextResponse.json({
    message:
      'If that email is registered, you will receive password reset instructions shortly.',
  });
}
