import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
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
          {devHint()}
          <BuyerOnboarding />
        </SellShell>
      );
    case 'profile_required':
      return (
        <SellShell>
          {devHint()}
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
