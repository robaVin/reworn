import type { Metadata } from 'next';
import {
  listPublishedListings,
  listBrowseCategories,
} from '@/modules/catalog/public-catalog';
import { parseBrowseQuery } from '@/modules/catalog/browse-query';
import {
  buildBrowseHref,
  searchParamsToRaw,
} from '@/modules/catalog/browse-url';
import {
  ListingGrid,
  ListingGridEmpty,
} from '@/components/marketplace/ListingGrid';
import { publicCardToListingCard } from '@/components/marketplace/listing-card-data';
import { FilterBar } from '@/components/marketplace/FilterBar';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const query = parseBrowseQuery(searchParamsToRaw(await searchParams));
  const title = query.q ? `“${query.q}” — Browse` : 'Browse the edit';
  // Canonical intentionally OMITS the cursor so paginated pages don't become
  // separate indexable URLs. Filtered/search pages are not promoted as landing
  // pages (noindex,follow) — only the bare /browse is indexable.
  const canonicalQuery = { ...query, cursor: undefined };
  const isFiltered =
    !!query.q ||
    !!query.categorySlug ||
    !!query.gender ||
    !!query.location ||
    query.sizes.length > 0 ||
    query.conditions.length > 0 ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined;
  return {
    title,
    alternates: { canonical: buildBrowseHref(canonicalQuery) },
    robots: isFiltered ? { index: false, follow: true } : undefined,
  };
}

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseBrowseQuery(searchParamsToRaw(await searchParams));
  const [page, categories] = await Promise.all([
    listPublishedListings(query),
    listBrowseCategories(),
  ]);

  const cards = page.items.map(publicCardToListingCard);
  const nextHref =
    page.nextCursor && buildBrowseHref(query, { cursor: page.nextCursor });

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Browse the edit
      </h1>

      <FilterBar query={query} categories={categories} />

      {/* Results region is focusable and the pagination target for keyboard
          users (the Next link points at #results). */}
      <div id="results" tabIndex={-1} className="scroll-mt-24 outline-none">
        {cards.length === 0 ? (
          <ListingGridEmpty
            title={
              query.q ? `No results for “${query.q}”` : 'No listings match yet'
            }
            action={
              <Button href="/browse" variant="outline">
                Clear filters
              </Button>
            }
          >
            Try fewer or different filters — or check back soon as sellers add
            more pieces.
          </ListingGridEmpty>
        ) : (
          <>
            <ListingGrid listings={cards} hrefFor={(l) => `/listing/${l.id}`} />
            <nav aria-label="Pagination" className="mt-10 flex justify-center">
              {nextHref ? (
                <Button href={`${nextHref}#results`} variant="outline">
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
