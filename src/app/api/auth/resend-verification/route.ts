import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { emailOnlySchema } from '@/modules/auth/schemas';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/resend-verification
 *
 * ENUMERATION-SAFE confirmation. Rate limited by middleware; a 429 from the
 * middleware / provider surfaces as "Too many requests" without revealing
 * whether the account exists.
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

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${appUrl}/api/auth/callback` },
  });

  if (error) {
    logger.warn('resend-verification error', { reason: error.message });
  }

  return NextResponse.json({
    message: 'If that email needs verification, a new message has been sent.',
  });
}
