'use client';

import { useState, useTransition } from 'react';
import {
  cancelSubscriptionAction,
  resumeSubscriptionAction,
} from '@/modules/subscription/actions';
import { Button } from '@/components/ui/Button';

/**
 * Seller-facing cancel-at-period-end / resume control. The only client state is
 * whether a cancellation is currently scheduled; the authoritative change is
 * made by the server action (owner-scoped, CSRF-protected). Access is never
 * revoked here — cancellation takes effect at the end of the paid period.
 */
export function SubscriptionManager({
  live,
  initiallyScheduled,
}: {
  live: boolean;
  initiallyScheduled: boolean;
}) {
  const [scheduled, setScheduled] = useState(initiallyScheduled);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!live) return null;

  const run = (
    action: typeof cancelSubscriptionAction | typeof resumeSubscriptionAction,
    next: boolean,
  ) =>
    start(async () => {
      setError(null);
      const res = await action();
      if (res.ok) setScheduled(next);
      else setError('Something went wrong. Please try again.');
    });

  return (
    <div className="mt-4">
      {scheduled ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Your subscription is set to cancel at the end of the current period.
            You keep access until then.
          </p>
          <Button
            variant="outline"
            onClick={() => run(resumeSubscriptionAction, false)}
            disabled={pending}
          >
            {pending ? 'Working…' : 'Resume subscription'}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => run(cancelSubscriptionAction, true)}
          disabled={pending}
        >
          {pending ? 'Working…' : 'Cancel subscription'}
        </Button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
