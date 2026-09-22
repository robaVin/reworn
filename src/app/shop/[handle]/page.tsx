import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import {
  resolvePublicSeller,
  listPublishedListings,
  countSellerPublishedListings,
} from '@/modules/catalog/public-catalog';
import { parseBrowseQuery } from '@/modules/catalog/browse-query';
import { searchParamsToRaw, storefrontRaw } from '@/modules/catalog/browse-url';
import { isValidHandle, normalizeHandle } from '@/modules/catalog/handle';
import {
  ListingGrid,
  ListingGridEmpty,
} from '@/components/marketplace/ListingGrid';
import {
  publicCardToListingCard,
  productHref,
} from '@/components/marketplace/listing-card-data';
import { savedStateForCards } from '@/modules/saved/collection';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

/** Storefront pagination href — carries only the cursor (newest order). */
function shopHref(handle: string, cursor?: string | null): string {
  return cursor
    ? `/shop/${handle}?cursor=${encodeURIComponent(cursor)}`
    : `/shop/${handle}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const t = await getTranslations('Shop');
  if (!isValidHandle(normalizeHandle(handle))) {
    return { title: t('metaNotFound'), robots: { index: false } };
  }
  const seller = await resolvePublicSeller(handle);
  if (!seller) return { title: t('metaNotFound'), robots: { index: false } };

  const description = t('metaDescription', { shopName: seller.shopName });
  return {
    title: t('metaTitle', { shopName: seller.shopName }),
    description,
    alternates: { canonical: `/shop/${seller.handle}` },
    openGraph: {
      title: seller.shopName,
      description,
      type: 'website',
      url: `/shop/${seller.handle}`,
    },
    robots: { index: true, follow: true },
  };
}

export default async function ShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  // Only a syntactically valid, non-reserved handle can name a seller.
  if (!isValidHandle(normalizeHandle(handle))) notFound();

  const seller = await resolvePublicSeller(handle);
  if (!seller) notFound();

  // Storefront honors ONLY the cursor — sort/search/filter params are ignored.
  const query = parseBrowseQuery(
    storefrontRaw(searchParamsToRaw(await searchParams)),
  );
  const [page, itemCount, t, tBrowse] = await Promise.all([
    listPublishedListings(query, { sellerId: seller.id }),
    countSellerPublishedListings(seller.id),
    getTranslations('Shop'),
    getTranslations('Browse'),
  ]);

  const cards = page.items.map(publicCardToListingCard);
  const { savedIds, authenticated } = await savedStateForCards(cards);
  const memberSince = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
  }).format(seller.joinedAt);

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <header className="border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
          {t('sellerEyebrow')}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-[34px]">
          {seller.shopName}
        </h1>
        <p className="mt-1 text-sm text-muted">@{seller.handle}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">{t('itemsForSale')}</dt>
            <dd className="font-semibold text-ink">{itemCount}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">{t('memberSince')}</dt>
            <dd className="font-semibold text-ink">{memberSince}</dd>
          </div>
        </dl>
      </header>

      <div
        id="results"
        tabIndex={-1}
        className="mt-8 scroll-mt-24 outline-none"
      >
        {cards.length === 0 ? (
          <ListingGridEmpty
            title={t('emptyTitle', { shopName: seller.shopName })}
            action={<Button href="/browse">{t('browseMarketplace')}</Button>}
          >
            {t('emptyBody')}
          </ListingGridEmpty>
        ) : (
          <>
            <ListingGrid
              listings={cards}
              hrefFor={productHref}
              savedIds={savedIds}
              authenticated={authenticated}
              priorityCount={4}
            />
            <nav
              aria-label={tBrowse('paginationLabel')}
              className="mt-10 flex justify-center"
            >
              {page.nextCursor ? (
                <Button
                  href={`${shopHref(seller.handle, page.nextCursor)}#results`}
                  variant="outline"
                >
                  {tBrowse('nextPage')}
                </Button>
              ) : (
                <p className="text-sm text-muted">{tBrowse('endReached')}</p>
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
