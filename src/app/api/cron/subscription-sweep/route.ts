import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { sweepSubscriptionLifecycle } from '@/modules/subscription/subscription-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scheduled subscription lifecycle sweep — advances active→grace→expired and
 * applies cancel-at-period-end (see `sweepSubscriptionLifecycle`). Trigger from
 * any scheduler (host cron, GitHub Actions, cron-job.org, Supabase pg_cron via
 * http) with:  `Authorization: Bearer <CRON_SECRET>`.
 *
 * Auth is a constant-time shared-secret compare. When `CRON_SECRET` is unset the
 * endpoint is DISABLED (503) so a misconfiguration can never leave an
 * unauthenticated job trigger exposed. The job itself is idempotent and can only
 * make stored status catch up with time — it can never extend access.
 */
function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await sweepSubscriptionLifecycle();
    logger.info('subscription.sweep', {
      enteredGrace: result.enteredGrace,
      cancelled: result.cancelled,
      expired: result.expired,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    logger.error('subscription.sweep.failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'sweep_failed' }, { status: 500 });
  }
}

/** Only POST triggers the job. */
export function GET(): NextResponse {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
