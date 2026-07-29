/**
 * Public seller handle (slug) rules — pure and shared by the DB (CHECK +
 * backfill mirror these), the application validation layer, and provisioning.
 *
 * A handle is a normalized, lowercase, URL-safe identifier used in /shop/[handle].
 * It never carries authorization and never encodes a UUID.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** Route names and sensitive words that must never be a seller handle. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'browse',
  'listing',
  'listings',
  'login',
  'logout',
  'messages',
  'seller',
  'sell',
  'shop',
  'signup',
  'signin',
  'support',
  'account',
  'settings',
  'about',
  'help',
  'new',
  'edit',
]);

/** Canonical shape: lowercase, starts/ends alphanumeric, [a-z0-9-] between. */
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** True if a string is a syntactically valid, non-reserved handle. */
export function isValidHandle(value: string): boolean {
  if (value.length < HANDLE_MIN || value.length > HANDLE_MAX) return false;
  if (!HANDLE_RE.test(value)) return false;
  if (value.includes('--')) return false;
  if (RESERVED_HANDLES.has(value)) return false;
  return true;
}

/**
 * Slugify an arbitrary shop name into a candidate handle BASE (may still need a
 * uniqueness suffix). Deterministic; matches the SQL backfill logic.
 */
export function slugifyHandleBase(input: string): string {
  let s = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alnum → hyphen
    .replace(/-+/g, '-') // collapse hyphens
    .replace(/^-|-$/g, ''); // trim hyphens
  if (s.length < HANDLE_MIN) s = s ? `${s}-shop` : 'seller';
  if (s.length > HANDLE_MAX) s = s.slice(0, HANDLE_MAX).replace(/-+$/g, '');
  return s;
}

/**
 * Normalize a user-supplied handle for lookup/case-insensitive comparison.
 * (Handles are stored already-lowercased; this makes reads defensive.)
 */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}
