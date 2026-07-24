import { z } from 'zod';

/**
 * Listing input validation (Zod).
 *
 * These mirror the DB CHECK constraints (migration 0006) so bad input is
 * rejected early with a friendly message AND cannot slip past into the
 * database. Money is integer minor units; currency is ISO-4217.
 */

export const LISTING_CONDITIONS = [
  'new',
  'like_new',
  'very_good',
  'good',
  'fair',
] as const;

export const LISTING_GENDERS = ['women', 'men', 'kids', 'unisex'] as const;

const title = z.string().trim().min(1, 'A title is required.').max(140);
const description = z
  .string()
  .trim()
  .min(1, 'A description is required.')
  .max(4000);
const size = z.string().trim().min(1, 'A size is required.').max(40);
const location = z.string().trim().min(1, 'A location is required.').max(120);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const priceMinor = z
  .number({ message: 'A price is required.' })
  .int('Price must be a whole number of minor units.')
  .min(0, 'Price cannot be negative.')
  .max(1_000_000_000);

/** ISO-4217 alpha code, upper-cased. Defaults to MKD. */
const currency = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter ISO code.')
  .toUpperCase()
  .default('MKD');

export const createListingSchema = z.object({
  title,
  description,
  categoryId: z.string().uuid('Choose a valid category.'),
  brand: optionalText(80),
  size,
  color: optionalText(40),
  material: optionalText(60),
  condition: z.enum(LISTING_CONDITIONS, {
    message: 'Choose a condition.',
  }),
  gender: z.enum(LISTING_GENDERS).default('unisex'),
  priceMinor,
  currency,
  originalPriceMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  location,
});

export type CreateListingInput = z.infer<typeof createListingSchema>;

/**
 * Editable fields. Ownership, status and identity are NEVER accepted from input
 * — they are resolved server-side. All fields optional (partial update).
 */
export const updateListingSchema = createListingSchema.partial();
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

export const listingTransitionSchema = z.enum([
  'publish',
  'pause',
  'republish',
  'archive',
  'relist',
]);
