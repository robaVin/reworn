'use server';

import { requireAnyRole } from '@/modules/auth/guards';
import {
  scheduleCancellation,
  resumeSubscription,
} from './subscription-service';
import {
  actionOk,
  toActionError,
  type ActionResult,
} from '@/modules/catalog/action-result';
import { enforceActionRateLimit } from '@/lib/security/rate-limit';

/**
 * Subscription mutation Server Actions — the seller-facing surface for
 * cancel-at-period-end and resume. Each re-verifies the seller/admin role
 * server-side; ownership is enforced in the service (scoped to the caller's
 * seller profile). Server Actions are CSRF-protected by Next.js. Activation and
 * the lifecycle sweep are SYSTEM-driven and never exposed here.
 */
export async function cancelSubscriptionAction(): Promise<
  ActionResult<{ cancelAt: string }>
> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    enforceActionRateLimit('subscription', ctx.userId);
    const { cancelAt } = await scheduleCancellation(ctx.userId);
    return actionOk({ cancelAt: cancelAt.toISOString() });
  } catch (error) {
    return toActionError(error);
  }
}

export async function resumeSubscriptionAction(): Promise<
  ActionResult<undefined>
> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    enforceActionRateLimit('subscription', ctx.userId);
    await resumeSubscription(ctx.userId);
    return actionOk(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
