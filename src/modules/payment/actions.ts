'use server';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/modules/auth/session';
import { logger } from '@/lib/logger';
import { timeSpan } from '@/lib/perf';
import { resolveCheckout } from './checkout-actions';
import type { CheckoutState } from './checkout-state';

/**
 * Checkout-initiation Server Action — the authenticated boundary that starts a
 * subscription checkout and redirects the seller to the provider.
 *
 * The client submits only a `planId`; the seller identity comes from the server
 * auth context. On success it redirects to the provider-hosted checkout URL. A
 * subscription is NEVER activated here — activation is the webhook's job (4C).
 * (The billing UI that calls this action is a later increment; the action is the
 * server boundary.)
 */
export async function startCheckoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const planId = formData.get('planId');
  if (typeof planId !== 'string' || planId.length === 0) {
    return { status: 'error', error: 'invalidPlan' };
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    // Session expired: never start checkout; bounce to sign-in.
    redirect('/login?next=%2Fseller%2Fsubscription');
  }

  const outcome = await timeSpan('action.startCheckout', () =>
    resolveCheckout(ctx.userId, planId),
  );

  // Safe observability: outcome kind only — never the checkout URL, provider
  // ids, secrets, or amounts.
  logger.info('checkout.initiate', {
    outcome: outcome.kind === 'redirect' ? 'redirect' : outcome.error,
  });

  if (outcome.kind === 'redirect') redirect(outcome.to);
  return { status: 'error', error: outcome.error };
}
