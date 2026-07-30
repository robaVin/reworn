import { minorToMajor } from '@/lib/format';
import type { PublicListingDetail } from './public-catalog';

/**
 * Build schema.org Product structured data from a public listing. Pure and
 * fully testable. Includes ONLY truthful, available data — no ratings, reviews,
 * shipping prices, return policy, checkout, or inventory quantities (ReWorn is a
 * classifieds marketplace; there is no platform transaction). Second-hand items
 * map to `UsedCondition` (`new` maps to `NewCondition`). A published listing is
 * always available -> `InStock`.
 *
 * The returned object is serialized for the page by {@link
 * safeJsonLdString} / the `JsonLd` component, which neutralizes any HTML-like
 * listing text.
 */
const CONDITION_SCHEMA: Record<string, string> = {
  new: 'https://schema.org/NewCondition',
  like_new: 'https://schema.org/UsedCondition',
  very_good: 'https://schema.org/UsedCondition',
  good: 'https://schema.org/UsedCondition',
  fair: 'https://schema.org/UsedCondition',
};

export function buildProductJsonLd(
  listing: PublicListingDetail,
  canonicalUrl: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: listing.title,
    url: canonicalUrl,
  };

  if (listing.description) data.description = listing.description;

  const images =
    listing.images.length > 0
      ? listing.images.map((i) => i.url)
      : listing.coverUrl
        ? [listing.coverUrl]
        : [];
  if (images.length > 0) data.image = images;

  if (listing.brand) data.brand = { '@type': 'Brand', name: listing.brand };
  if (listing.categoryName) data.category = listing.categoryName;
  if (listing.color) data.color = listing.color;
  if (listing.size) data.size = listing.size;
  if (listing.condition) {
    data.itemCondition =
      CONDITION_SCHEMA[listing.condition] ?? 'https://schema.org/UsedCondition';
  }

  if (listing.priceMinor !== null) {
    data.offers = {
      '@type': 'Offer',
      price: minorToMajor(listing.priceMinor),
      priceCurrency: listing.currency,
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
    };
  }

  return data;
}
