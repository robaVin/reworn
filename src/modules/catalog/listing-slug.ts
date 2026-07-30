/**
 * Public product-slug rules — pure and shared by the write service and tests.
 * The SQL backfill in migration 0018 mirrors the human-part logic.
 *
 * A listing slug is the stable, human-readable key in /products/[slug]. It is
 * generated ONCE at first publish and never changed, so public URLs stay stable
 * across later edits. Shape: `<kebab-title>-<code>`, where `<code>` is derived
 * from the listing id and guarantees global uniqueness (the id is unique).
 *
 * The slug carries NO authorization and is not a security boundary — the public
 * read path still hard-filters `status = 'published'`.
 */

/** Max length of the human (title-derived) part, before the code suffix. */
export const SLUG_TITLE_MAX = 60;

/**
 * Kebab-case the human part of a slug: strip diacritics, lowercase, collapse
 * every run of non-alphanumerics to a single hyphen, trim hyphens, and cap the
 * length. Returns `'listing'` when nothing usable remains (e.g. a title of only
 * punctuation or non-Latin script), so the slug is never empty.
 */
export function slugifyListingTitle(title: string): string {
  const base = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // non-alnum -> hyphen
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, SLUG_TITLE_MAX)
    .replace(/-+$/g, ''); // trim a hyphen left dangling by the slice
  return base || 'listing';
}

/**
 * A short, lowercase, id-derived code appended to a slug to make it unique.
 * `len` hex chars of the id (dashes removed). 8 chars (32 bits) is unique in
 * practice; callers escalate `len` on the astronomically rare collision.
 */
export function slugCodeFromId(id: string, len = 8): string {
  return id.replace(/-/g, '').toLowerCase().slice(0, len);
}

/**
 * Build the full, stable product slug for a listing. Deterministic in
 * `(title, id, codeLen)`.
 */
export function buildListingSlug(
  id: string,
  title: string,
  codeLen = 8,
): string {
  return `${slugifyListingTitle(title)}-${slugCodeFromId(id, codeLen)}`;
}
