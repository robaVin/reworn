import type { Metadata } from 'next';
import type { ListingCardData } from '@/modules/catalog/types';
import {
  listPublishedListings,
  listBrowseCategories,
  type PublicListingCard,
} from '@/modules/catalog/public-catalog';
import { parseBrowseQuery } from '@/modules/catalog/browse-query';
import {
  buildBrowseHref,
  searchParamsToRaw,
} from '@/modules/catalog/browse-url';
import { LISTING_CONDITIONS } from '@/modules/catalog/schemas';
import {
  ListingGrid,
  ListingGridEmpty,
} from '@/components/marketplace/ListingGrid';
import { FilterBar } from '@/components/marketplace/FilterBar';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

const CONDITION_LABELS: Record<string, string> = {
  new: 'New with tags',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
};
// Keep the label map exhaustive with the enum (compile-time nudge).
void (LISTING_CONDITIONS satisfies readonly (keyof typeof CONDITION_LABELS)[]);

/** Deterministic 0–360 hue for the no-photo placeholder tint. */
function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function toCard(l: PublicListingCard): ListingCardData {
  return {
    id: l.id,
    title: l.title,
    brand: l.brand ?? '',
    size: l.size ?? '',
    category: l.categoryName ?? '',
    condition: l.condition
      ? (CONDITION_LABELS[l.condition] ?? l.condition)
      : '',
    priceMinor: l.priceMinor ?? 0,
    currency: l.currency,
    imageUrl: l.coverUrl,
    tintHue: hueFromId(l.id),
  };
}

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

  const cards = page.items.map(toCard);
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
