/**
 * Narrow catalog types needed by reusable UI components.
 *
 * DELIBERATELY MINIMAL: the full Listing domain model (Prisma schema,
 * services, RLS) arrives with the catalog increment. This shape is what a
 * listing card needs to render, and the future `Listing` → `ListingCardData`
 * mapping must stay trivial: money is integer minor units + ISO-4217 code,
 * ids are strings (uuid), categories are display names.
 */
export interface ListingCardData {
  id: string;
  title: string;
  brand: string;
  size: string;
  /** Display name of the category (e.g. "Outerwear"). */
  category: string;
  condition: string;
  /** Asking price in MINOR units (cents/deni). Informational only — payment
   *  happens directly between buyer and seller, outside ReWorn. */
  priceMinor: number;
  /** ISO-4217 currency code. */
  currency: string;
  /** Photo URL; null renders the garment-glyph placeholder. */
  imageUrl: string | null;
  /** Hue (0-360) for the placeholder tint when there is no photo. */
  tintHue: number;
  /** Optional editorial tag, e.g. "New in". */
  tag?: string;
}
