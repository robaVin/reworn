import { getTranslations } from 'next-intl/server';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

/**
 * Seller dashboard — permanent Sustainable shell under the real seller guard.
 *
 * TRUTHFUL (Slice A / ahead of Increment #6): no fabricated views, inquiries,
 * quota meters or subscription status. Cards describe what will connect when
 * the subscription and catalog domains land.
 */
export default async function SellerHomePage() {
  await requireAnyRolePage(['seller', 'admin'], '/seller');
  const t = await getTranslations('Sell');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        {t('sellerStudio')}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[40px]">
        {t('dashboard.heading')}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        {t('dashboard.intro')}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            {t('dashboard.subscriptionTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t('dashboard.subscriptionBody')}
          </p>
          <div className="mt-4">
            <Button href="/seller/subscription" variant="outline" size="sm">
              {t('dashboard.openSubscription')}
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            {t('dashboard.listingsTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t('dashboard.listingsBody')}
          </p>
          <div className="mt-4">
            <Button href="/seller/listings" variant="outline" size="sm">
              {t('dashboard.openListings')}
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            {t('dashboard.inquiriesTitle')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {t('dashboard.inquiriesBody')}
          </p>
          <div className="mt-4">
            <Button href="/messages" variant="outline" size="sm">
              {t('dashboard.openMessages')}
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-8 max-w-xl">
        <Alert tone="info" title={t('dashboard.noMetricsTitle')}>
          {t('dashboard.noMetricsBody')}
        </Alert>
      </div>
    </main>
  );
}
