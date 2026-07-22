import type { ListingCardData } from '@/modules/catalog/types';

/**
 * EDITORIAL DESIGN SAMPLES — NOT MARKETPLACE DATA.
 *
 * Approved scope (Decision 1, Slice A): a small, clearly identified set of
 * display-only records that validate the permanent listing-card component
 * and homepage layout.
 *
 * Rules enforced here and in the consuming components:
 *  - never stored in, or implied to come from, the production database
 *  - rendered WITHOUT links, save actions or message actions
 *    (ListingCard without `href` is non-interactive)
 *  - the section carries a visible "design samples" label in development
 *    builds only (see EditSection)
 *  - REPLACED by real listing-service data in the catalog increment; this
 *    module is deleted at that point
 *
 * Brands are fictional (from the approved prototype). Prices are minor
 * units + ISO-4217 like the real domain model.
 */
export const EDITORIAL_SAMPLE_LISTINGS: ListingCardData[] = [
  {
    id: 'sample-01',
    brand: 'Maison Kré',
    title: 'Wool Overcoat',
    priceMinor: 24000,
    currency: 'EUR',
    category: 'Outerwear',
    size: 'M',
    condition: 'Excellent',
    tag: 'The edit',
    imageUrl: null,
    tintHue: 20,
  },
  {
    id: 'sample-02',
    brand: 'Studio Nord',
    title: 'Silk Slip Dress',
    priceMinor: 12000,
    currency: 'EUR',
    category: 'Dresses',
    size: 'S',
    condition: 'Like new',
    imageUrl: null,
    tintHue: 67,
  },
  {
    id: 'sample-03',
    brand: 'Archive Lab',
    title: 'Cashmere Knit',
    priceMinor: 9500,
    currency: 'EUR',
    category: 'Knitwear',
    size: 'L',
    condition: 'Very good',
    tag: 'New in',
    imageUrl: null,
    tintHue: 114,
  },
  {
    id: 'sample-04',
    brand: 'Neue Form',
    title: 'Leather Tote',
    priceMinor: 31000,
    currency: 'EUR',
    category: 'Bags',
    size: 'OS',
    condition: 'Excellent',
    imageUrl: null,
    tintHue: 161,
  },
  {
    id: 'sample-05',
    brand: 'Halden',
    title: 'Straight Denim',
    priceMinor: 7800,
    currency: 'EUR',
    category: 'Denim',
    size: '30',
    condition: 'Very good',
    imageUrl: null,
    tintHue: 208,
  },
  {
    id: 'sample-06',
    brand: 'Bris & Co',
    title: 'Oversized Blazer',
    priceMinor: 16500,
    currency: 'EUR',
    category: 'Outerwear',
    size: 'M',
    condition: 'Pristine',
    tag: 'The edit',
    imageUrl: null,
    tintHue: 255,
  },
  {
    id: 'sample-07',
    brand: 'Lykke',
    title: 'Canvas Sneakers',
    priceMinor: 6400,
    currency: 'EUR',
    category: 'Shoes',
    size: '41',
    condition: 'Like new',
    imageUrl: null,
    tintHue: 302,
  },
  {
    id: 'sample-08',
    brand: 'Fernwood',
    title: 'Merino Cardigan',
    priceMinor: 8800,
    currency: 'EUR',
    category: 'Knitwear',
    size: 'M',
    condition: 'Excellent',
    imageUrl: null,
    tintHue: 349,
  },
];

/** Category chips shown on the homepage; mirror the seeded category tree
 *  direction and link into /browse (truthful placeholder until the catalog
 *  increment). */
export const BROWSE_CATEGORIES = [
  'Outerwear',
  'Tops',
  'Dresses',
  'Denim',
  'Knitwear',
  'Bags',
  'Shoes',
] as const;
