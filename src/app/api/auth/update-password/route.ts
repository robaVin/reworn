import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { updatePasswordSchema } from '@/modules/auth/schemas';
import { getVerifiedUser } from '@/modules/auth/session';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/update-password
 *
 * Requires a server-verified session (typically a recovery session established
 * via /api/auth/callback?next=/reset-password). Client-supplied tokens are
 * never accepted. Follows Supabase `updateUser({ password })` behaviour for
 * session rotation — we do not invent additional invalidation rules.
 */
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const parsed = updatePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please choose a password of at least 8 characters.' },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseUserClient();
  const user = await getVerifiedUser(supabase);
  if (!user) {
    return NextResponse.json(
      {
        error: 'This reset link is invalid or has expired. Request a new one.',
      },
      { status: 401 },
    );
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    logger.warn('update-password failed', {
      reason: error.message,
      userId: user.id,
    });
    return NextResponse.json(
      {
        error: 'This reset link is invalid or has expired. Request a new one.',
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    message: 'Your password has been updated. You can log in now.',
  });
}
