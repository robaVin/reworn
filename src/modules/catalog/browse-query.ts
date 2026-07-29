import { z } from 'zod';
import { LISTING_CONDITIONS, LISTING_GENDERS } from './schemas';

/**
 * Public browse query — parsing, validation and normalization for the
 * marketplace. Everything here is pure so it is unit-testable and identical on
 * the server render path and (later) the client filter bar.
 *
 * Hard rules: whitelisted sort only (never a client column name), bounded page
 * size, capped lengths, non-negative + ordered price range, normalized
 * whitespace/case. Unknown/invalid filter values are DROPPED (not 500s).
 */

export const BROWSE_SORTS = [
  'newest',
  'price_asc',
  'price_desc',
  'relevance',
] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;
export const MAX_Q_LENGTH = 100;
export const MAX_LOCATION_LENGTH = 80;
export const MAX_SIZE_VALUES = 20;
export const MAX_PRICE_MINOR = 1_000_000_000; // 10,000,000.00 — hard cap

/** Collapse internal whitespace, trim, and cap length. */
function normText(v: string, max: number): string {
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The single source of truth for a validated, normalized browse query. */
export interface BrowseQuery {
  q?: string;
  categorySlug?: string;
  sizes: string[];
  conditions: string[];
  gender?: string;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  sort: BrowseSort;
  pageSize: number;
  /** Opaque cursor string as received (decoded/validated by the service). */
  cursor?: string;
}

const toArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' ? [v] : [];

const intOrUndef = (v: unknown): number | undefined => {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : undefined;
};

/**
 * Parse raw searchParams (string | string[] | undefined values) into a
 * BrowseQuery. Never throws; invalid pieces are dropped so a hostile or
 * malformed URL degrades to a valid, safe query.
 */
export function parseBrowseQuery(raw: Record<string, unknown>): BrowseQuery {
  const slug = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,63}$/)
    .safeParse(typeof raw.category === 'string' ? raw.category : '');

  const q = typeof raw.q === 'string' ? normText(raw.q, MAX_Q_LENGTH) : '';

  const sizes = Array.from(
    new Set(
      toArray(raw.size)
        .map((s) => normText(s, 40))
        .filter(Boolean),
    ),
  ).slice(0, MAX_SIZE_VALUES);

  const conditions = Array.from(
    new Set(
      toArray(raw.condition).filter((c): c is string =>
        (LISTING_CONDITIONS as readonly string[]).includes(c),
      ),
    ),
  );

  const gender =
    typeof raw.gender === 'string' &&
    (LISTING_GENDERS as readonly string[]).includes(raw.gender)
      ? raw.gender
      : undefined;

  // Price: reject negatives (dropped), cap the maximum, drop a reversed range.
  const boundPrice = (v: number | undefined): number | undefined => {
    if (v === undefined) return undefined;
    if (v < 0) return undefined; // reject negatives
    return Math.min(v, MAX_PRICE_MINOR); // cap
  };
  let minPrice = boundPrice(intOrUndef(raw.minPrice));
  let maxPrice = boundPrice(intOrUndef(raw.maxPrice));
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    minPrice = undefined;
    maxPrice = undefined;
  }

  const location =
    typeof raw.location === 'string' && raw.location.trim()
      ? normText(raw.location, MAX_LOCATION_LENGTH).toLowerCase()
      : undefined;

  const requestedSort = typeof raw.sort === 'string' ? raw.sort : '';
  let sort: BrowseSort = (BROWSE_SORTS as readonly string[]).includes(
    requestedSort,
  )
    ? (requestedSort as BrowseSort)
    : q
      ? 'relevance'
      : 'newest';
  // Relevance only makes sense with a search term.
  if (sort === 'relevance' && !q) sort = 'newest';

  return {
    q: q || undefined,
    categorySlug: slug.success && slug.data ? slug.data : undefined,
    sizes,
    conditions,
    gender,
    minPrice,
    maxPrice,
    location,
    sort,
    pageSize: DEFAULT_PAGE_SIZE,
    cursor: typeof raw.cursor === 'string' ? raw.cursor : undefined,
  };
}

/**
 * Stable fingerprint of everything that defines a result set EXCEPT the cursor
 * and sort (sort is carried separately in the cursor). A cursor is only valid
 * against a matching fingerprint, so changing any filter/search invalidates it.
 */
export function filterFingerprint(query: BrowseQuery): string {
  const canonical = JSON.stringify({
    q: query.q ?? '',
    c: query.categorySlug ?? '',
    s: [...query.sizes].sort(),
    cond: [...query.conditions].sort(),
    g: query.gender ?? '',
    mn: query.minPrice ?? '',
    mx: query.maxPrice ?? '',
    l: query.location ?? '',
  });
  // Small, dependency-free FNV-1a hash (non-cryptographic; identity only).
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
