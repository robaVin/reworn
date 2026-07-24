import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getAuthContext } from '@/modules/auth/session';
import { canActAsSeller } from '@/modules/auth/roles';
import { getSellerAccess } from '@/modules/catalog/listing-service';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Sell on ReWorn' };
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

  const ctx = await getAuthContext();

  // 1. Signed-out → real login, returning to /sell.
  if (!ctx) {
    redirect(`/login?next=${encodeURIComponent('/sell')}`);
  }

  // 2. Authenticated buyer (no seller role) → truthful onboarding.
  if (!canActAsSeller(ctx.roles)) {
    return (
      <SellShell>
        {devHint()}
        <BuyerOnboarding />
      </SellShell>
    );
  }

  const access = await getSellerAccess(ctx.userId);

  // 3. Seller role but no seller profile → profile required.
  if (!access.seller) {
    return (
      <SellShell>
        {devHint()}
        <SellerProfileRequired />
      </SellShell>
    );
  }

  // 4. Seller profile not active → truthful blocked state.
  if (access.seller.status !== 'active') {
    return (
      <SellShell>
        <SellerNotActive status={access.seller.status} />
      </SellShell>
    );
  }

  // 5. Active seller but not entitled to publish (enforcement on, no
  //    subscription) → truthful subscription-required state.
  if (!access.canPublish) {
    return (
      <SellShell>
        <SubscriptionRequired />
      </SellShell>
    );
  }

  // 6. Entitled seller → straight to create-a-listing.
  redirect('/seller/listings/new');
}

/** The development-testing hint is shown ONLY when the dev bridge is active. */
function devHint() {
  if (env.SUBSCRIPTION_ENFORCEMENT) return null;
  return (
    <Alert tone="info" title="Development testing access">
      Subscription enforcement is off in this environment, so an approved seller
      account can test listing creation. Provision your account (development
      only):
      <code className="mt-2 block rounded-lg bg-sand px-3 py-2 text-xs text-ink">
        npm run dev:seller:provision -- --email you@example.com
      </code>
      Then reload this page.
    </Alert>
  );
}

function SellShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Sell on ReWorn
      </p>
      <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
        Your closet clean-out can do good.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        ReWorn is a classifieds marketplace: you keep 100% of what you sell.
        Buyers contact you directly, and payment and delivery stay between you
        and the buyer.
      </p>
      <div className="mt-8 space-y-5">{children}</div>
    </main>
  );
}

function BuyerOnboarding() {
  return (
    <>
      <Alert tone="info" title="Seller access">
        Seller subscriptions will be required before production launch, and the
        bank payment integration is still being configured. You&apos;ll need an
        active seller profile before you can create listings.
      </Alert>
      <p className="text-sm leading-relaxed text-muted">
        In-app seller onboarding (profile + subscription) arrives in a later
        update. When it&apos;s ready you&apos;ll be able to set up your seller
        profile here.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button href="/account" variant="outline">
          Your account
        </Button>
        <Button href="/browse" variant="ghost">
          Keep browsing
        </Button>
      </div>
    </>
  );
}

function SellerProfileRequired() {
  return (
    <Alert tone="info" title="Complete your seller profile">
      Your account has seller access but no seller profile yet. A seller profile
      is required before creating listings. In-app profile completion arrives in
      a later update.
    </Alert>
  );
}

function SellerNotActive({ status }: { status: string }) {
  return (
    <Alert tone="warning" title="Seller account not active">
      Your seller account is currently <strong>{status}</strong>, so you
      can&apos;t create or publish listings. Please contact support.
    </Alert>
  );
}

function SubscriptionRequired() {
  return (
    <>
      <Alert tone="info" title="A seller subscription is required">
        Publishing listings requires an active seller subscription. Your account
        is ready — only the payment step remains.
      </Alert>
      <div className="rounded-card border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          Payment setup unavailable
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The bank payment integration is awaiting configuration, so
          subscription checkout is not available yet. No payment is taken and no
          charge is created by viewing this page. Please check back once payment
          setup is complete.
        </p>
        <div className="mt-4">
          {/* Disabled on purpose: no fabricated checkout. */}
          <Button disabled aria-disabled>
            Payment setup unavailable
          </Button>
        </div>
      </div>
    </>
  );
}
