import 'server-only';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { timeSpan } from '@/lib/perf';
import { AuthorizationError } from '@/modules/auth/errors';
import { createPendingSubscription } from '@/modules/subscription/subscription-service';
import { getPaymentProvider } from './provider-factory';
import type { PaymentProvider } from './provider';
import { CheckoutRejectedError } from './errors';
import type { CheckoutSessionDTO } from './dto';

/**
 * Checkout service — orchestrates checkout INITIATION. It owns seller
 * authorization, the entitlement/plan checks, pending-subscription
 * creation/reuse (delegated to the 4A subscription domain), and provider
 * orchestration. It NEVER activates a subscription — activation is exclusively
 * the webhook's responsibility (4C). The subscription stays `pending` here.
 *
 * Idempotency policy: a pending subscription has AT MOST ONE open checkout
 * attempt (`ux_one_open_attempt_per_subscription`, migration 0017). A repeated
 * initiation for the same seller + plan REUSES the still-open session (no new
 * provider session, no new row). A different plan supersedes the pending
 * subscription (4A) and starts a fresh session. Only a truly concurrent
 * double-initiation may create a second provider session (a provider
 * limitation), but only one attempt is ever persisted and used.
 */
export async function initiateCheckout(
  userId: string,
  planId: string,
  provider: PaymentProvider = getPaymentProvider(),
): Promise<CheckoutSessionDTO> {
  // --- Authorization: only an ACTIVE seller may initiate checkout ------------
  const seller = await prisma.sellerProfile.findUnique({
    where: { profileId: userId },
    select: { id: true, status: true },
  });
  if (!seller) throw new AuthorizationError(403, 'seller_profile_required');
  if (seller.status !== 'active') {
    throw new AuthorizationError(403, `seller_${seller.status}`);
  }

  // --- Plan -------------------------------------------------------------------
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      code: true,
      name: true,
      priceMinor: true,
      currency: true,
      isActive: true,
    },
  });
  if (!plan || !plan.isActive) throw new CheckoutRejectedError('invalid_plan');

  // --- Pending subscription (4A: reuse same-plan / supersede different-plan) --
  const pending = await createPendingSubscription(seller.id, planId);

  // --- Reuse an existing OPEN checkout session for this pending subscription --
  const now = new Date();
  const reusable = await prisma.paymentAttempt.findFirst({
    where: {
      subscriptionId: pending.id,
      status: 'pending',
      provider: provider.id,
      expiresAt: { gt: now },
      checkoutUrl: { not: null },
    },
    select: { checkoutUrl: true },
  });
  if (reusable?.checkoutUrl) return { checkoutUrl: reusable.checkoutUrl };

  // --- Create a new provider session -----------------------------------------
  const merchantReference = `chk_${randomUUID()}`;
  const expiresAt = new Date(
    now.getTime() + env.PAYMENT_ATTEMPT_TTL_MINUTES * 60_000,
  );
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  const session = await timeSpan('provider.createCheckoutSession', () =>
    provider.createCheckoutSession({
      merchantReference,
      sellerId: seller.id,
      planCode: plan.code,
      planName: plan.name,
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      successUrl: `${base}/seller/subscription?checkout=success`,
      cancelUrl: `${base}/seller/subscription?checkout=cancelled`,
      expiresAt,
    }),
  );

  // --- Persist the attempt (webhook-reconciliation state only). Idempotent on
  //     the one-open-attempt partial unique: a concurrent winner is reused. ----
  try {
    await prisma.paymentAttempt.create({
      data: {
        merchantReference,
        profileId: userId,
        sellerId: seller.id,
        planId,
        subscriptionId: pending.id,
        expectedAmountMinor: plan.priceMinor,
        expectedCurrency: plan.currency,
        status: 'pending',
        provider: provider.id,
        providerReference: session.providerSessionId,
        checkoutUrl: session.checkoutUrl,
        expiresAt,
      },
    });
    return { checkoutUrl: session.checkoutUrl };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      const winner = await prisma.paymentAttempt.findFirst({
        where: { subscriptionId: pending.id, status: 'pending' },
        select: { checkoutUrl: true },
      });
      if (winner?.checkoutUrl) return { checkoutUrl: winner.checkoutUrl };
    }
    throw e;
  }
}
