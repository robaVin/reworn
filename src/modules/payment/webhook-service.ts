import 'server-only';

import type { PaymentAttempt, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { recordProviderEventOnce } from '@/modules/subscription/provider-events';
import { activatePendingSubscriptionTx } from '@/modules/subscription/subscription-service';
import type { ProviderPaymentEvent } from './provider';

/**
 * Webhook processing — the ONLY place a subscription is activated. A verified,
 * normalised provider event is:
 *   1. matched to our `payment_attempt` (by merchant reference / session id),
 *   2. recorded EXACTLY ONCE via `recordProviderEventOnce` (dedup on
 *      `provider_event_id`), and
 *   3. applied IN THE SAME TRANSACTION as the event insert — so the attempt
 *      update + subscription activation + lifecycle event all commit atomically,
 *      and a duplicate rolls the whole effect back.
 *
 * Idempotent + out-of-order safe:
 *   - a replay (same event id) is a no-op;
 *   - a *different* event id for an already-succeeded attempt records the event
 *     but does NOT re-activate (`already_active`);
 *   - a `payment_failed` arriving AFTER success does NOT downgrade
 *     (`ignored_after_success`) — success is terminal for the attempt;
 *   - activation only ever happens from a `pending` subscription, and is skipped
 *     (`conflict_existing_live`) if the seller already holds a live subscription;
 *   - a mismatched amount is refused (`amount_mismatch`) — never activates.
 */

export type WebhookOutcome =
  | 'ignored_unknown'
  | 'ignored_no_attempt'
  | 'activated'
  | 'already_active'
  | 'replay'
  | 'payment_failed_recorded'
  | 'ignored_after_success'
  | 'expired_recorded'
  | 'ignored_expired'
  | 'amount_mismatch'
  | 'conflict_existing_live'
  | 'succeeded_no_subscription';

export interface WebhookProcessResult {
  outcome: WebhookOutcome;
}

async function findAttempt(
  event: ProviderPaymentEvent,
): Promise<PaymentAttempt | null> {
  if (event.merchantReference) {
    const a = await prisma.paymentAttempt.findUnique({
      where: { merchantReference: event.merchantReference },
    });
    if (a) return a;
  }
  if (event.providerSessionId) {
    return prisma.paymentAttempt.findFirst({
      where: { providerReference: event.providerSessionId },
    });
  }
  return null;
}

/** Apply the domain effect of a SUCCEEDED payment, on the given transaction. */
async function applySucceeded(
  tx: Prisma.TransactionClient,
  attemptId: string,
  event: ProviderPaymentEvent,
): Promise<WebhookOutcome> {
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  if (a.status === 'succeeded') return 'already_active'; // out-of-order duplicate

  // Amount integrity: a mismatched charge never activates a subscription.
  if (
    (event.amountMinor !== undefined &&
      event.amountMinor !== a.expectedAmountMinor) ||
    (event.currency !== undefined && event.currency !== a.expectedCurrency)
  ) {
    return 'amount_mismatch';
  }

  await tx.paymentAttempt.update({
    where: { id: a.id },
    data: { status: 'succeeded', processedAt: new Date() },
  });

  if (!a.subscriptionId) return 'succeeded_no_subscription';
  const sub = await tx.subscription.findUnique({
    where: { id: a.subscriptionId },
  });
  if (!sub) return 'succeeded_no_subscription';
  if (sub.status !== 'pending') return 'already_active'; // already handled

  // Never create a second live subscription for the seller.
  const otherLive = await tx.subscription.findFirst({
    where: {
      sellerId: sub.sellerId,
      status: { in: ['active', 'grace_period'] },
      id: { not: sub.id },
    },
    select: { id: true },
  });
  if (otherLive) return 'conflict_existing_live';

  const now = new Date();
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({
    where: { id: a.planId },
    select: { termDays: true },
  });
  const periodEnd = new Date(now.getTime() + plan.termDays * 86_400_000);
  const graceEndsAt = new Date(
    periodEnd.getTime() + env.SUBSCRIPTION_GRACE_PERIOD_DAYS * 86_400_000,
  );
  await activatePendingSubscriptionTx(tx, sub.id, {
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    graceEndsAt,
    paymentAttemptId: a.id,
    reason: 'payment_verified',
  });
  return 'activated';
}

async function applyFailed(
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<WebhookOutcome> {
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  // Success is terminal: a late failure never reverses an activated attempt.
  if (a.status === 'succeeded') return 'ignored_after_success';
  await tx.paymentAttempt.update({
    where: { id: a.id },
    data: { status: 'failed', processedAt: new Date() },
  });
  // The subscription stays `pending` — a failed payment never activates it.
  return 'payment_failed_recorded';
}

async function applyExpired(
  tx: Prisma.TransactionClient,
  attemptId: string,
): Promise<WebhookOutcome> {
  const a = await tx.paymentAttempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  if (a.status !== 'pending') return 'ignored_expired';
  await tx.paymentAttempt.update({
    where: { id: a.id },
    data: { status: 'expired', processedAt: new Date() },
  });
  return 'expired_recorded';
}

/** Process one verified provider event. Idempotent and out-of-order safe. */
export async function processWebhookEvent(
  event: ProviderPaymentEvent,
): Promise<WebhookProcessResult> {
  if (event.kind === 'unknown') return { outcome: 'ignored_unknown' };

  const attempt = await findAttempt(event);
  if (!attempt) return { outcome: 'ignored_no_attempt' };

  const type =
    event.kind === 'payment_succeeded'
      ? 'verified'
      : event.kind === 'payment_failed'
        ? 'rejected'
        : 'expired';
  const toStatus =
    event.kind === 'payment_succeeded'
      ? 'succeeded'
      : event.kind === 'payment_failed'
        ? 'failed'
        : 'expired';

  let outcome: WebhookOutcome = 'ignored_unknown';
  const { isReplay } = await recordProviderEventOnce(
    {
      paymentAttemptId: attempt.id,
      providerEventId: event.providerEventId,
      type,
      fromStatus: attempt.status,
      toStatus,
      // Redacted, non-sensitive summary only.
      payloadSummary: { kind: event.kind },
    },
    async (tx) => {
      if (event.kind === 'payment_succeeded') {
        outcome = await applySucceeded(tx, attempt.id, event);
      } else if (event.kind === 'payment_failed') {
        outcome = await applyFailed(tx, attempt.id);
      } else {
        outcome = await applyExpired(tx, attempt.id);
      }
    },
  );

  if (isReplay) return { outcome: 'replay' };
  return { outcome };
}
