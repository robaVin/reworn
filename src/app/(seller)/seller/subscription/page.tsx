import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { getSubscriptionForUser } from '@/modules/subscription/subscription-service';
import { SubscriptionManager } from '@/components/seller/SubscriptionManager';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Sell');
  return { title: t('meta.subscriptionTitle') };
}
export const dynamic = 'force-dynamic';

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
  const t = await getTranslations('Sell');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        {t('sellerStudio')}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('subscriptionPage.heading')}
      </h1>

      <div className="mt-6 max-w-xl space-y-6">
        {!sub ? (
          <>
            <Alert tone="info" title={t('subscriptionPage.noSubTitle')}>
              {t('subscriptionPage.noSubBody')}
            </Alert>
            <div className="flex gap-3">
              <Button href="/pricing">
                {t('subscriptionPage.choosePlan')}
              </Button>
              <Button href="/seller" variant="outline">
                {t('subscriptionPage.backToDashboard')}
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-card border border-line bg-surface p-5">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Row
                label={t('subscriptionPage.planLabel')}
                value={sub.plan.name}
              />
              <Row
                label={t('subscriptionPage.statusLabel')}
                value={
                  t.has(`subStatus.${sub.status}`)
                    ? t(`subStatus.${sub.status}`)
                    : sub.status
                }
              />
              <Row
                label={t('subscriptionPage.quotaLabel')}
                value={String(sub.plan.weeklyListingQuota)}
              />
              {sub.currentPeriodEnd && (
                <Row
                  label={
                    sub.cancelAt
                      ? t('subscriptionPage.accessUntil')
                      : t('subscriptionPage.renewsOn')
                  }
                  value={
                    <time dateTime={sub.currentPeriodEnd.toISOString()}>
                      {formatDate(sub.currentPeriodEnd)}
                    </time>
                  }
                />
              )}
              {sub.isTrial && (
                <Row
                  label={t('subscriptionPage.trialLabel')}
                  value={t('subscriptionPage.trialYes')}
                />
              )}
            </dl>

            {sub.cancelAt && (
              <p className="mt-4 rounded-control border border-line bg-sand px-3 py-2 text-sm text-muted">
                {t.rich('subscriptionPage.cancellationScheduled', {
                  date: formatDate(sub.cancelAt),
                  time: (chunks) => (
                    <time dateTime={sub.cancelAt!.toISOString()}>{chunks}</time>
                  ),
                })}
              </p>
            )}

            <SubscriptionManager
              live={live}
              initiallyScheduled={sub.cancelAt !== null}
            />

            <div className="mt-6 border-t border-line pt-4">
              <Button href="/seller" variant="outline">
                {t('subscriptionPage.backToDashboard')}
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted">
          {t.rich('subscriptionPage.policyNote', {
            link: (chunks) => (
              <a href="/refunds" className="underline">
                {chunks}
              </a>
            ),
          })}
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
