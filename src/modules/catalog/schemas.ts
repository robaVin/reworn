import { z } from 'zod';

/**
 * Listing input validation (Zod).
 *
 * Two schemas, mirroring the DB (migration 0006/0007):
 *  - `draftListingSchema`  — LENIENT. A draft needs only a title; every other
 *    content field is optional, so an incomplete draft can be saved.
 *  - `publishableListingSchema` — STRICT. All mandatory fields must be present
 *    and valid; used to validate a listing at PUBLISH time.
 *
 * Money is integer minor units; currency is ISO-4217.
 */

export const LISTING_CONDITIONS = [
  'new',
  'like_new',
  'very_good',
  'good',
  'fair',
] as const;

export const LISTING_GENDERS = ['women', 'men', 'kids', 'unisex'] as const;

export const DELIVERY_METHODS = [
  'unspecified',
  'shipping',
  'pickup',
  'both',
] as const;

const title = z.string().trim().min(1, 'A title is required.').max(140);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const priceMinor = z
  .number({ message: 'Enter a price.' })
  .int('Price must be a whole number of minor units.')
  .min(0, 'Price cannot be negative.')
  .max(1_000_000_000);

const currency = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter ISO code.')
  .toUpperCase()
  .default('MKD');

const condition = z.enum(LISTING_CONDITIONS, {
  message: 'Choose a condition.',
});
const gender = z.enum(LISTING_GENDERS).default('unisex');
const deliveryMethod = z.enum(DELIVERY_METHODS).optional();
const categoryId = z.string().uuid('Choose a valid category.');
const originalPriceMinor = z
  .number()
  .int()
  .min(0)
  .max(1_000_000_000)
  .optional();

/** LENIENT draft — only `title` is required. */
export const draftListingSchema = z.object({
  title,
  description: optionalText(4000),
  categoryId: categoryId.optional(),
  brand: optionalText(80),
  size: optionalText(40),
  color: optionalText(40),
  material: optionalText(60),
  condition: condition.optional(),
  gender,
  priceMinor: priceMinor.optional(),
  currency,
  originalPriceMinor,
  location: optionalText(120),
  deliveryMethod,
  deliveryNote: optionalText(200),
});
export type DraftListingInput = z.infer<typeof draftListingSchema>;

/** Partial update — every field optional (including title). */
export const updateListingSchema = draftListingSchema.partial();
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

/** STRICT — all mandatory fields present. Used to gate publishing. */
export const publishableListingSchema = z.object({
  title,
  description: z.string().trim().min(1, 'A description is required.').max(4000),
  categoryId,
  brand: optionalText(80),
  size: z.string().trim().min(1, 'A size is required.').max(40),
  color: optionalText(40),
  material: optionalText(60),
  condition,
  gender,
  priceMinor,
  currency,
  originalPriceMinor,
  location: z.string().trim().min(1, 'A location is required.').max(120),
  deliveryMethod,
  deliveryNote: optionalText(200),
});
export type PublishableListingInput = z.infer<typeof publishableListingSchema>;

export const listingTransitionSchema = z.enum([
  'publish',
  'pause',
  'republish',
  'archive',
  'relist',
]);
