/**
 * Listing-image configuration. Shared by validation, processing, storage and
 * the service so limits are defined once.
 */

/** Private Supabase Storage bucket that holds processed listing images. */
export const IMAGE_BUCKET = 'listing-images';

/** Maximum images per listing (enforced server-side). */
export const MAX_LISTING_IMAGES = 8;

/** Maximum accepted RAW upload size, before processing. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** Minimum dimension (px) on each side — rejects tiny/thumbnail uploads. */
export const MIN_DIMENSION = 400;

/** Absolute maximum source dimension (px) — rejects decompression-bomb sizes. */
export const MAX_DIMENSION = 8000;

/** Longest side of the stored image after resize. */
export const TARGET_MAX_DIMENSION = 1600;

/** Accepted INPUT content types. Everything is re-encoded to WebP on output. */
export const ACCEPTED_INPUT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** Output format for all stored images. */
export const OUTPUT_MIME = 'image/webp';
export const OUTPUT_EXTENSION = 'webp';

/** Signed-URL lifetime for reading a private image. */
export const SIGNED_URL_TTL_SECONDS = 3600;
