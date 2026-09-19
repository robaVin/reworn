import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/env';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  getAuthContext,
  getVerifiedUserForRequest,
} from '@/modules/auth/session';
import { canActAsSeller } from '@/modules/auth/roles';
import { getSellerAccess } from '@/modules/catalog/listing-service';
import { resolveSellDestination } from '@/modules/catalog/sell-routing';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Sell');
  return { title: t('meta.sellTitle') };
}
export const dynamic = 'force-dynamic';

/**
 * Canonical seller entry. The header "Sell an item" CTA always points here and
 * the SERVER decides the destination from the verified user's state. Nothing is
 * decided from browser state, query strings, or cookies.
 */
export default async function SellPage() {
  // Without an auth backend, treat everyone as signed-out.
  if (!isSupabaseConfigured()) {
    redirect(`/login?next=${encodeURIComponent('/sell')}`);
  }

  // Establish the verified user first (one getUser). Signed-out → real login.
  const user = await getVerifiedUserForRequest();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent('/sell')}`);
  }

  // Independent after the user id is known: roles (in getAuthContext) and the
  // seller-access lookup run CONCURRENTLY. getUser is not repeated (both reuse
  // the request-memoized result); the subscription lookup still waits for the
  // seller identity inside getSellerAccess.
  const [ctx, access] = await Promise.all([
    getAuthContext(),
    getSellerAccess(user.id),
  ]);

  const destination = resolveSellDestination({
    canActAsSeller: ctx ? canActAsSeller(ctx.roles) : false,
    seller: access.seller,
    canPublish: access.canPublish,
  });

  switch (destination) {
    case 'buyer_onboarding':
      return (
        <SellShell>
          <DevHint />
          <BuyerOnboarding />
        </SellShell>
      );
    case 'profile_required':
      return (
        <SellShell>
          <DevHint />
          <SellerProfileRequired />
        </SellShell>
      );
    case 'seller_not_active':
      return (
        <SellShell>
          <SellerNotActive status={access.seller!.status} />
        </SellShell>
      );
    case 'subscription_required':
      return (
        <SellShell>
          <SubscriptionRequired />
        </SellShell>
      );
    case 'create':
      redirect('/seller/listings/new');
  }
}

/** The development-testing hint is shown ONLY when the dev bridge is active. */
async function DevHint() {
  if (env.SUBSCRIPTION_ENFORCEMENT) return null;
  const t = await getTranslations('Sell');
  return (
    <Alert tone="info" title={t('devHint.title')}>
      {t('devHint.body')}
      <code className="mt-2 block rounded-lg bg-sand px-3 py-2 text-xs text-ink">
        npm run dev:seller:provision -- --email you@example.com
      </code>
      {t('devHint.reload')}
    </Alert>
  );
}

async function SellShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('Sell');
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        {t('page.eyebrow')}
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
        {t('page.heading')}
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        {t('page.intro')}
      </p>
      <div className="mt-8 space-y-5">{children}</div>
    </main>
  );
}

async function BuyerOnboarding() {
  const t = await getTranslations('Sell');
  return (
    <>
      <Alert tone="info" title={t('buyerOnboarding.alertTitle')}>
        {t('buyerOnboarding.alertBody')}
      </Alert>
      <p className="text-sm leading-relaxed text-muted">
        {t('buyerOnboarding.body')}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button href="/account" variant="outline">
          {t('buyerOnboarding.yourAccount')}
        </Button>
        <Button href="/browse" variant="ghost">
          {t('buyerOnboarding.keepBrowsing')}
        </Button>
      </div>
    </>
  );
}

async function SellerProfileRequired() {
  const t = await getTranslations('Sell');
  return (
    <Alert tone="info" title={t('profileRequired.title')}>
      {t('profileRequired.body')}
    </Alert>
  );
}

async function SellerNotActive({ status }: { status: string }) {
  const t = await getTranslations('Sell');
  return (
    <Alert tone="warning" title={t('notActive.title')}>
      {t.rich('notActive.body', {
        status,
        strong: (chunks) => <strong>{chunks}</strong>,
      })}
    </Alert>
  );
}

async function SubscriptionRequired() {
  const t = await getTranslations('Sell');
  return (
    <>
      <Alert tone="info" title={t('subscriptionRequired.alertTitle')}>
        {t('subscriptionRequired.alertBody')}
      </Alert>
      <div className="rounded-card border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          {t('subscriptionRequired.cardTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t('subscriptionRequired.cardBody')}
        </p>
        <div className="mt-4">
          {/* Disabled on purpose: no fabricated checkout. */}
          <Button disabled aria-disabled>
            {t('subscriptionRequired.button')}
          </Button>
        </div>
      </div>
    </>
  );
}
