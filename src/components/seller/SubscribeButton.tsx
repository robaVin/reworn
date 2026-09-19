'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { startCheckoutAction } from '@/modules/payment/actions';
import {
  INITIAL_CHECKOUT_STATE,
  checkoutErrorMessageKey,
} from '@/modules/payment/checkout-state';
import { Button } from '@/components/ui/Button';

/**
 * Subscribe control for a pricing plan. Progressively enhanced form bound to the
 * existing checkout Server Action: the only submitted field is the plan id; the
 * seller identity comes from the server session. On success the action redirects
 * to the provider-hosted checkout page (a subscription is NEVER activated here —
 * activation is the verified webhook's job). Failures render a safe, generic
 * message (e.g. "Payments aren't available yet" while no provider is live).
 */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const t = useTranslations('Sell');
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="w-full"
    >
      {pending ? t('subscribe.starting') : label}
    </Button>
  );
}

export function SubscribeButton({
  planId,
  label,
}: {
  planId: string;
  label?: string;
}) {
  const t = useTranslations('Sell');
  const tc = useTranslations('Checkout');
  const [state, action] = useActionState(
    startCheckoutAction,
    INITIAL_CHECKOUT_STATE,
  );
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="planId" value={planId} />
      <Submit label={label ?? t('subscribe.default')} />
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {tc(`error.${checkoutErrorMessageKey(state.error)}`)}
        </p>
      )}
    </form>
  );
}
