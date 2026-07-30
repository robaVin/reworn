import type { ListingCardData } from '@/modules/catalog/types';
import type { PublicListingCard } from '@/modules/catalog/public-catalog';

/**
 * Maps a public listing DTO to the reusable ListingCard's view model. Shared by
 * /browse and /shop so the two grids stay identical. No internal fields leak —
 * PublicListingCard already excludes seller/profile ids, email, etc.
 */

const CONDITION_LABELS: Record<string, string> = {
  new: 'New with tags',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
};

/** Deterministic 0–360 hue for the no-photo placeholder tint. */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/**
 * The canonical public URL for a listing card. Prefers the stable product slug
 * (`/products/[slug]`); falls back to the legacy id route (which 308-redirects
 * to the canonical URL) only if a slug is somehow absent.
 */
export function productHref(l: Pick<ListingCardData, 'slug' | 'id'>): string {
  return l.slug ? `/products/${l.slug}` : `/listing/${l.id}`;
}

export function publicCardToListingCard(l: PublicListingCard): ListingCardData {
  return {
    id: l.id,
    slug: l.slug,
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
