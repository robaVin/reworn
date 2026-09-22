import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import {
  resolveSellerForUser,
  countSellerListingsByStatus,
  listSellerListingCards,
} from '@/modules/catalog/listing-service';
import { getSubscriptionForUser } from '@/modules/subscription/subscription-service';
import { listConversationSummariesForCurrentUser } from '@/modules/messaging/service';
import { Alert } from '@/components/ui/Alert';
import { SellerMetrics } from '@/components/seller/dashboard/SellerMetrics';
import { DashboardListings } from '@/components/seller/dashboard/DashboardListings';
import { CreateListingCard } from '@/components/seller/dashboard/CreateListingCard';
import { SellerPlanCard } from '@/components/seller/dashboard/SellerPlanCard';
import { RecentConversations } from '@/components/seller/dashboard/RecentConversations';

export const dynamic = 'force-dynamic';

/** Preview bounds — never load full datasets to render the dashboard. */
const LISTINGS_PREVIEW = 6;
const CONVERSATIONS_PREVIEW = 5;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Sell');
  return { title: t('sellerStudio') };
}

/**
 * Seller Studio — the seller's primary operational workspace.
 *
 * Every figure is REAL and authoritative, derived server-side from the
 * authenticated user's own data (`resolveSellerForUser(ctx.userId)`); nothing is
 * client-supplied. There are NO fabricated metrics: no earnings, views, orders,
 * sales charts, or growth — Galerija has no authoritative data for those. The
 * four cards are real listing status counts; the rest is real listings,
 * subscription state, and conversations. A seller-role user without a
 * SellerProfile yet gets a truthful onboarding state (never auto-provisioned).
 */
export default async function SellerHomePage() {
  const ctx = await requireAnyRolePage(['seller', 'admin'], '/seller');
  const seller = await resolveSellerForUser(ctx.userId);
  const t = await getTranslations('Sell');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
            {t('sellerStudio')}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[40px]">
            {seller
              ? t('dashboard.welcome', { name: seller.shopName })
              : t('dashboard.welcomeGeneric')}
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-semibold text-terracotta-strong hover:text-terracotta-hover"
        >
          ← {t('dashboard.backToShopping')}
        </Link>
      </header>

      {seller ? (
        <SellerStudioBody userId={ctx.userId} />
      ) : (
        <div className="mt-8 max-w-xl space-y-6">
          <Alert tone="info" title={t('dashboard.onboardingTitle')}>
            {t('dashboard.onboardingBody')}
          </Alert>
          <CreateListingCard />
        </div>
      )}
    </main>
  );
}

/**
 * The populated dashboard. Independent sections are fetched in PARALLEL (no
 * waterfall); each query is seller-scoped by the authenticated `userId` and
 * bounded (status counts via one grouped query; listing/conversation previews
 * capped). `resolveSellerForUser` is request-memoized, so the four services
 * share a single seller lookup.
 */
async function SellerStudioBody({ userId }: { userId: string }) {
  const [counts, listings, subscription, conversations] = await Promise.all([
    countSellerListingsByStatus(userId),
    listSellerListingCards(userId, { limit: LISTINGS_PREVIEW }),
    getSubscriptionForUser(userId),
    listConversationSummariesForCurrentUser(userId, undefined, {
      limit: CONVERSATIONS_PREVIEW,
    }),
  ]);

  return (
    <>
      <div className="mt-8">
        <SellerMetrics counts={counts} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <DashboardListings listings={listings} />
        </div>
        <div className="space-y-6">
          <CreateListingCard />
          <SellerPlanCard subscription={subscription} />
          <RecentConversations conversations={conversations.items} />
        </div>
      </div>
    </>
  );
}
