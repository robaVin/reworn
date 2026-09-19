import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { listActiveSubscriptionPlans } from '@/modules/subscription/subscription-service';
import { SubscribeButton } from '@/components/seller/SubscribeButton';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/format';
import { COMPANY } from '@/config/company';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Sell');
  return {
    title: t('meta.pricingTitle'),
    description: t('meta.pricingDescription'),
    alternates: { canonical: '/pricing' },
    robots: { index: true, follow: true },
  };
}

export const dynamic = 'force-dynamic';

/**
 * Public pricing page. Buyers are always free; sellers choose a plan to publish
 * listings. Selecting a plan starts checkout via the server action (which
 * redirects to the provider and bounces signed-out visitors to sign in first).
 */
export default async function PricingPage() {
  const plans = await listActiveSubscriptionPlans();
  const t = await getTranslations('Sell');

  return (
    <main className="mx-auto max-w-shell px-4 py-12 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        {t('pricing.eyebrow')}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('pricing.heading')}
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        {t('pricing.intro', {
          gateway: COMPANY.paymentGateway,
          currency: COMPANY.currency,
        })}
      </p>

      {plans.length === 0 ? (
        <Alert
          tone="info"
          title={t('pricing.comingSoonTitle')}
          className="mt-8 max-w-xl"
        >
          {t('pricing.comingSoonBody')}
        </Alert>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <section
              key={plan.id}
              aria-labelledby={`plan-${plan.code}`}
              className="flex flex-col rounded-card border border-line bg-surface p-6 shadow-soft"
            >
              <h2
                id={`plan-${plan.code}`}
                className="font-display text-xl font-bold text-ink"
              >
                {plan.name}
              </h2>
              <p className="mt-3">
                <span className="text-2xl font-bold text-ink">
                  {formatPrice(plan.priceMinor, plan.currency)}
                </span>{' '}
                <span className="text-sm text-muted">
                  {t('pricing.perDays', { days: plan.termDays })}
                </span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
                <li>
                  {t.rich('pricing.publishUpTo', {
                    quota: plan.weeklyListingQuota,
                    strong: (chunks) => (
                      <strong className="text-ink">{chunks}</strong>
                    ),
                  })}
                </li>
                <li>{t('pricing.directMessaging')}</li>
                <li>{t('pricing.shopPage')}</li>
              </ul>
              <SubscribeButton
                planId={plan.id}
                label={t('pricing.choosePlan', { name: plan.name })}
              />
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted">
        {t.rich('pricing.legal', {
          terms: (chunks) => (
            <Link href="/terms" className="underline">
              {chunks}
            </Link>
          ),
          refunds: (chunks) => (
            <Link href="/refunds" className="underline">
              {chunks}
            </Link>
          ),
          subscription: (chunks) => (
            <Link href="/seller/subscription" className="underline">
              {chunks}
            </Link>
          ),
        })}
      </p>

      <div className="mt-6">
        <Button href="/browse" variant="outline">
          {t('pricing.backToBrowse')}
        </Button>
      </div>
    </main>
  );
}
