import { getTranslations } from 'next-intl/server';
import type { SellerSubscriptionDTO } from '@/modules/subscription/dto';
import { Button } from '@/components/ui/Button';

/**
 * Compact Seller Plan card. Shows ONLY truthful state from the existing
 * subscription system (`getSubscriptionForUser`) — plan name, status, and the
 * weekly listing quota the plan grants. "Manage subscription" links to the
 * existing route; no billing/payment behavior is touched here. Enforcement may
 * be off/unavailable in some environments — a null subscription renders a
 * truthful "no active plan" state, never a fabricated plan.
 */
export async function SellerPlanCard({
  subscription,
}: {
  subscription: SellerSubscriptionDTO | null;
}) {
  const t = await getTranslations('Sell');
  return (
    <section
      aria-labelledby="dash-plan-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-soft"
    >
      <h2
        id="dash-plan-heading"
        className="font-display text-lg font-bold text-ink"
      >
        {t('dashboard.planHeading')}
      </h2>

      {subscription ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('dashboard.planCurrent')}</dt>
            <dd className="font-medium text-ink">{subscription.plan.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('dashboard.planStatus')}</dt>
            <dd className="font-medium text-ink">
              {t.has(`subStatus.${subscription.status}`)
                ? t(`subStatus.${subscription.status}`)
                : subscription.status}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('dashboard.planQuota')}</dt>
            <dd className="font-medium text-ink">
              {subscription.plan.weeklyListingQuota}
            </dd>
          </div>
          {subscription.cancelAt && (
            <p className="pt-1 text-xs text-muted">
              {t('dashboard.planCancelling')}
            </p>
          )}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-muted">{t('dashboard.planNone')}</p>
      )}

      <div className="mt-4">
        <Button href="/seller/subscription" variant="outline">
          {subscription ? t('dashboard.planManage') : t('dashboard.planChoose')}
        </Button>
      </div>
    </section>
  );
}
