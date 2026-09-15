import type { Metadata } from 'next';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { getSubscriptionForUser } from '@/modules/subscription/subscription-service';
import { SubscriptionManager } from '@/components/seller/SubscriptionManager';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Subscription' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Payment pending',
  active: 'Active',
  grace_period: 'Active (grace period)',
  expired: 'Expired',
  cancelled: 'Cancelled',
  suspended: 'Suspended',
};

/**
 * Seller subscription — shows the seller's REAL subscription state from the
 * subscription service (never fixtures) and lets them cancel-at-period-end or
 * resume. Choosing/paying for a plan lives on the pricing → checkout flow.
 */
export default async function SellerSubscriptionPage() {
  const ctx = await requireAnyRolePage(
    ['seller', 'admin'],
    '/seller/subscription',
  );
  const sub = await getSubscriptionForUser(ctx.userId);
  const live = sub?.status === 'active' || sub?.status === 'grace_period';

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Seller studio
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        Subscription
      </h1>

      <div className="mt-6 max-w-xl space-y-6">
        {!sub ? (
          <>
            <Alert tone="info" title="No active subscription">
              You don’t have a subscription yet. Choose a plan to start
              publishing listings.
            </Alert>
            <div className="flex gap-3">
              <Button href="/pricing">Choose a plan</Button>
              <Button href="/seller" variant="outline">
                Back to seller dashboard
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-card border border-line bg-surface p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Row label="Plan" value={sub.plan.name} />
              <Row
                label="Status"
                value={STATUS_LABELS[sub.status] ?? sub.status}
              />
              <Row
                label="Weekly listing quota"
                value={String(sub.plan.weeklyListingQuota)}
              />
              {sub.currentPeriodEnd && (
                <Row
                  label={sub.cancelAt ? 'Access until' : 'Renews on'}
                  value={
                    <time dateTime={sub.currentPeriodEnd.toISOString()}>
                      {formatDate(sub.currentPeriodEnd)}
                    </time>
                  }
                />
              )}
              {sub.isTrial && <Row label="Trial" value="Yes" />}
            </dl>

            {sub.cancelAt && (
              <p className="mt-4 rounded-control border border-line bg-sand px-3 py-2 text-sm text-muted">
                Cancellation scheduled for{' '}
                <time dateTime={sub.cancelAt.toISOString()}>
                  {formatDate(sub.cancelAt)}
                </time>
                .
              </p>
            )}

            <SubscriptionManager
              live={live}
              initiallyScheduled={sub.cancelAt !== null}
            />

            <div className="mt-6 border-t border-line pt-4">
              <Button href="/seller" variant="outline">
                Back to seller dashboard
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted">
          See our{' '}
          <a href="/refunds" className="underline">
            Subscription, Refunds &amp; Cancellation
          </a>{' '}
          policy.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-cream px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
