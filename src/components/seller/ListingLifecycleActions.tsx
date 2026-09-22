'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Alert } from '@/components/ui/Alert';
import { transitionListingAction } from '@/modules/catalog/actions';
import type {
  ListingStatus,
  ListingTransition,
} from '@/modules/catalog/listing-status';

/**
 * Owner-only listing lifecycle controls. Every action calls the
 * server-authoritative `transitionListingAction`, which re-verifies the seller
 * role and (in the service) OWNERSHIP + validity of the transition — the client
 * never decides authorization, and `soldAt` is stamped/cleared server-side.
 *
 * Consequential transitions (mark sold, mark available/relist, archive) require
 * an explicit accessible confirmation. `sold` is a SELLER DECLARATION only:
 * Galerija does not process the sale, so the copy never claims a transaction.
 */

type UiAction = {
  action: ListingTransition;
  variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  /** When set, a confirmation dialog is shown before the action runs. */
  confirm: boolean;
};

/** Curated, status-appropriate actions (a subset of the state machine). */
const ACTIONS_BY_STATUS: Partial<Record<ListingStatus, UiAction[]>> = {
  published: [
    { action: 'markSold', variant: 'primary', confirm: true },
    { action: 'pause', variant: 'outline', confirm: false },
    { action: 'archive', variant: 'ghost', confirm: true },
  ],
  paused: [
    { action: 'markSold', variant: 'primary', confirm: true },
    { action: 'archive', variant: 'ghost', confirm: true },
  ],
  sold: [
    { action: 'markAvailable', variant: 'primary', confirm: true },
    { action: 'archive', variant: 'ghost', confirm: true },
  ],
  archived: [{ action: 'relist', variant: 'outline', confirm: false }],
};

export function ListingLifecycleActions({
  listingId,
  status,
}: {
  listingId: string;
  status: ListingStatus;
}) {
  const t = useTranslations('Sell');
  const router = useRouter();
  const [pending, setPending] = useState<ListingTransition | null>(null);
  const [confirming, setConfirming] = useState<ListingTransition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actions = ACTIONS_BY_STATUS[status] ?? [];
  if (actions.length === 0) return null;

  async function run(action: ListingTransition) {
    setPending(action);
    setError(null);
    try {
      const res = await transitionListingAction(listingId, action);
      if (!res.ok) {
        setError(
          res.error === 'subscription_required'
            ? t('error.subscriptionRequired')
            : res.error === 'listing_incomplete'
              ? t('error.incomplete')
              : t('lifecycle.error'),
        );
        return;
      }
      setConfirming(null);
      // Server-rendered surfaces (badges, dashboard counts) re-read on refresh.
      router.refresh();
    } catch {
      setError(t('lifecycle.error'));
    } finally {
      setPending(null);
    }
  }

  function onClick(a: UiAction) {
    if (a.confirm) setConfirming(a.action);
    else void run(a.action);
  }

  return (
    <section
      aria-labelledby="lifecycle-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-soft"
    >
      <h2
        id="lifecycle-heading"
        className="font-display text-lg font-semibold text-ink"
      >
        {t('lifecycle.heading')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('lifecycle.intro')}</p>

      {error && (
        <div className="mt-4">
          <Alert tone="danger" title={t('alert.pleaseReview')}>
            {error}
          </Alert>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {actions.map((a) => (
          <Button
            key={a.action}
            variant={a.variant}
            onClick={() => onClick(a)}
            disabled={pending !== null}
          >
            {pending === a.action
              ? t('lifecycle.working')
              : t(`lifecycle.action.${a.action}`)}
          </Button>
        ))}
      </div>

      <Dialog
        open={confirming !== null}
        onClose={() => (pending ? undefined : setConfirming(null))}
        label={confirming ? t(`lifecycle.confirm.${confirming}.title`) : ''}
      >
        {confirming && (
          <div className="p-6">
            <h3 className="font-display text-xl font-bold text-ink">
              {t(`lifecycle.confirm.${confirming}.title`)}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t(`lifecycle.confirm.${confirming}.body`)}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setConfirming(null)}
                disabled={pending !== null}
              >
                {t('lifecycle.cancel')}
              </Button>
              <Button
                variant={confirming === 'archive' ? 'danger' : 'primary'}
                onClick={() => void run(confirming)}
                disabled={pending !== null}
              >
                {pending
                  ? t('lifecycle.working')
                  : t(`lifecycle.confirm.${confirming}.cta`)}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
