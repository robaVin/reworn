import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
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
import {
  publicCardToListingCard,
  productHref,
} from '@/components/marketplace/listing-card-data';
import { savedStateForCards } from '@/modules/saved/collection';
import { FilterBar } from '@/components/marketplace/FilterBar';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const query = parseBrowseQuery(searchParamsToRaw(await searchParams));
  const t = await getTranslations('Browse');
  const title = query.q
    ? t('searchMetaTitle', { query: query.q })
    : t('heading');
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
  const [page, categories, t] = await Promise.all([
    listPublishedListings(query),
    listBrowseCategories(),
    getTranslations('Browse'),
  ]);

  const cards = page.items.map(publicCardToListingCard);
  const { savedIds, authenticated } = await savedStateForCards(cards);
  const nextHref =
    page.nextCursor && buildBrowseHref(query, { cursor: page.nextCursor });

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('heading')}
      </h1>

      <FilterBar query={query} categories={categories} />

      {/* Results region is focusable and the pagination target for keyboard
          users (the Next link points at #results). */}
      <div id="results" tabIndex={-1} className="scroll-mt-24 outline-none">
        {cards.length === 0 ? (
          <ListingGridEmpty
            title={
              query.q
                ? t('noResultsTitle', { query: query.q })
                : t('noListingsTitle')
            }
            action={
              <Button href="/browse" variant="outline">
                {t('clearFilters')}
              </Button>
            }
          >
            {t('emptyBody')}
          </ListingGridEmpty>
        ) : (
          <>
            <ListingGrid
              listings={cards}
              hrefFor={productHref}
              priorityCount={4}
              savedIds={savedIds}
              authenticated={authenticated}
            />
            <nav
              aria-label={t('paginationLabel')}
              className="mt-10 flex justify-center"
            >
              {nextHref ? (
                <Button href={`${nextHref}#results`} variant="outline">
                  {t('nextPage')}
                </Button>
              ) : (
                <p className="text-sm text-muted">{t('endReached')}</p>
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
