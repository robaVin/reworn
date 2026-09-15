import type { Metadata } from 'next';
import Link from 'next/link';
import { listActiveSubscriptionPlans } from '@/modules/subscription/subscription-service';
import { SubscribeButton } from '@/components/seller/SubscribeButton';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/format';
import { COMPANY } from '@/config/company';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Seller subscription plans for ReWorn — publish listings on a monthly plan.',
  alternates: { canonical: '/pricing' },
  robots: { index: true, follow: true },
};

export const dynamic = 'force-dynamic';

/**
 * Public pricing page. Buyers are always free; sellers choose a plan to publish
 * listings. Selecting a plan starts checkout via the server action (which
 * redirects to the provider and bounces signed-out visitors to sign in first).
 */
export default async function PricingPage() {
  const plans = await listActiveSubscriptionPlans();

  return (
    <main className="mx-auto max-w-shell px-4 py-12 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Pricing
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        Sell on ReWorn
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Browsing and messaging are always free. Sellers choose a plan to publish
        listings. Payments are processed securely by {COMPANY.paymentGateway} in{' '}
        {COMPANY.currency}; ReWorn never stores your card details.
      </p>

      {plans.length === 0 ? (
        <Alert tone="info" title="Plans coming soon" className="mt-8 max-w-xl">
          Subscription plans aren’t available yet. Please check back shortly.
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
                  / {plan.termDays} days
                </span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-muted">
                <li>
                  Publish up to{' '}
                  <strong className="text-ink">
                    {plan.weeklyListingQuota}
                  </strong>{' '}
                  listings per week
                </li>
                <li>Direct buyer messaging</li>
                <li>Your public shop page</li>
              </ul>
              <SubscribeButton planId={plan.id} label={`Choose ${plan.name}`} />
            </section>
          ))}
        </div>
      )}

      <p className="mt-8 text-xs text-muted">
        By subscribing you agree to our{' '}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/refunds" className="underline">
          Refunds &amp; Cancellation policy
        </Link>
        . Manage or cancel anytime from your{' '}
        <Link href="/seller/subscription" className="underline">
          subscription page
        </Link>
        .
      </p>

      <div className="mt-6">
        <Button href="/browse" variant="outline">
          Back to browse
        </Button>
      </div>
    </main>
  );
}
