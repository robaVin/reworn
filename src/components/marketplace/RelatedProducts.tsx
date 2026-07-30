import {
  getRelatedListings,
  type RelatedQuery,
} from '@/modules/catalog/public-catalog';
import { publicCardToListingCard, productHref } from './listing-card-data';
import { ListingGrid, ListingGridSkeleton } from './ListingGrid';

/**
 * "You might also like" — up to 8 related published listings, deterministically
 * ranked in the service. Rendered inside its OWN Suspense boundary on the PDP so
 * its query + cover-signing never delay the primary product content. Cards link
 * to the canonical `/products/[slug]`. With no matches the section is omitted.
 */
export async function RelatedProducts({ query }: { query: RelatedQuery }) {
  const related = await getRelatedListings(query, 8);
  if (related.length === 0) return null;

  const cards = related.map(publicCardToListingCard);
  return (
    <section
      aria-labelledby="related-heading"
      className="mt-16 border-t border-line pt-10"
    >
      <h2
        id="related-heading"
        className="font-display text-2xl font-bold text-ink"
      >
        You might also like
      </h2>
      <div className="mt-6">
        <ListingGrid listings={cards} hrefFor={productHref} />
      </div>
    </section>
  );
}

/** Layout-stable placeholder shown while related products stream in. */
export function RelatedProductsSkeleton() {
  return (
    <section
      aria-hidden
      className="mt-16 border-t border-line pt-10"
      data-testid="related-skeleton"
    >
      <div className="h-7 w-56 rounded-control bg-sand" />
      <div className="mt-6">
        <ListingGridSkeleton count={4} />
      </div>
    </section>
  );
}
