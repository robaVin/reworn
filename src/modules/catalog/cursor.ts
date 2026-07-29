import type { BrowseSort } from './browse-query';

/**
 * Opaque, versioned keyset cursor. Base64url-encoded JSON carrying exactly what
 * deterministic pagination needs — and a fingerprint of the active
 * search/filters + the active sort, so a cursor from a DIFFERENT query is
 * rejected (pagination resets to page 1) rather than producing wrong results.
 *
 * The client never supplies column names; only this validated payload steers
 * the keyset predicate.
 */

const CURSOR_VERSION = 1 as const;

export interface CursorPayload {
  v: typeof CURSOR_VERSION;
  sort: BrowseSort;
  /** Stringified sort key: ISO timestamp (newest), integer (price), float (rank). */
  sortValue: string;
  /** UUID tiebreaker — the final, deterministic ordering key. */
  id: string;
  /** filterFingerprint() of the query the cursor was minted for. */
  fp: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decode + validate a cursor against the CURRENT sort and filter fingerprint.
 * Returns null (→ caller resets to the first page) when the cursor is missing,
 * malformed, the wrong version, or does not match the current query.
 */
export function decodeCursor(
  raw: string | undefined,
  expected: { sort: BrowseSort; fp: string },
): CursorPayload | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const p = obj as Record<string, unknown>;
  if (p.v !== CURSOR_VERSION) return null;
  if (p.sort !== expected.sort) return null;
  if (p.fp !== expected.fp) return null;
  if (typeof p.sortValue !== 'string') return null;
  if (typeof p.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.id)) return null;

  // Validate the sort value for the active sort so a tampered/garbage cursor
  // (NaN, Infinity, non-date) resets to page 1 rather than producing a broken
  // keyset predicate. Numeric ranks/prices keep FULL precision (no rounding).
  if (p.sort === 'newest') {
    if (Number.isNaN(Date.parse(p.sortValue))) return null;
  } else {
    // price_asc | price_desc | relevance
    if (!Number.isFinite(Number(p.sortValue))) return null;
  }

  return {
    v: CURSOR_VERSION,
    sort: p.sort as BrowseSort,
    sortValue: p.sortValue,
    id: p.id,
    fp: p.fp as string,
  };
}
