import type { Metadata } from 'next';
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
  if (!isValidHandle(normalizeHandle(handle))) {
    return { title: 'Seller not found', robots: { index: false } };
  }
  const seller = await resolvePublicSeller(handle);
  if (!seller) return { title: 'Seller not found', robots: { index: false } };

  const description = `Shop pre-loved fashion from ${seller.shopName} on ReWorn.`;
  return {
    title: `${seller.shopName} — Seller`,
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
  const [page, itemCount] = await Promise.all([
    listPublishedListings(query, { sellerId: seller.id }),
    countSellerPublishedListings(seller.id),
  ]);

  const cards = page.items.map(publicCardToListingCard);
  const memberSince = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
  }).format(seller.joinedAt);

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <header className="border-b border-line pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
          Seller
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-ink sm:text-[34px]">
          {seller.shopName}
        </h1>
        <p className="mt-1 text-sm text-muted">@{seller.handle}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">Items for sale</dt>
            <dd className="font-semibold text-ink">{itemCount}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-muted">Member since</dt>
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
            title={`${seller.shopName} has no listings yet`}
            action={<Button href="/browse">Browse the marketplace</Button>}
          >
            This seller hasn’t published any items yet. Check back soon.
          </ListingGridEmpty>
        ) : (
          <>
            <ListingGrid
              listings={cards}
              hrefFor={productHref}
              priorityCount={4}
            />
            <nav aria-label="Pagination" className="mt-10 flex justify-center">
              {page.nextCursor ? (
                <Button
                  href={`${shopHref(seller.handle, page.nextCursor)}#results`}
                  variant="outline"
                >
                  Next page
                </Button>
              ) : (
                <p className="text-sm text-muted">You’ve reached the end.</p>
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
