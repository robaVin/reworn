import type { BrowseQuery, BrowseSort } from './browse-query';

/**
 * Canonical /browse URL builder — the single, pure place that turns a validated
 * BrowseQuery into a shareable URL. Deterministic (sorted multi-values, fixed
 * key order), omits defaults, and omits the cursor unless one is explicitly
 * provided — so any filter/sort change (which rebuilds without a cursor)
 * automatically resets pagination, and shared URLs are clean.
 */

/** The sort that is implied (and therefore omitted from the URL) for a query. */
export function defaultSortFor(query: Pick<BrowseQuery, 'q'>): BrowseSort {
  return query.q ? 'relevance' : 'newest';
}

export function buildBrowseHref(
  query: BrowseQuery,
  opts: { cursor?: string | null } = {},
): string {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.categorySlug) p.set('category', query.categorySlug);
  if (query.gender) p.set('gender', query.gender);
  [...query.sizes].sort().forEach((s) => p.append('size', s));
  [...query.conditions].sort().forEach((c) => p.append('condition', c));
  if (query.minPrice !== undefined) p.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== undefined) p.set('maxPrice', String(query.maxPrice));
  if (query.location) p.set('location', query.location);
  if (query.sort !== defaultSortFor(query)) p.set('sort', query.sort);
  if (opts.cursor) p.set('cursor', opts.cursor);

  const qs = p.toString();
  return qs ? `/browse?${qs}` : '/browse';
}

/**
 * Storefront (/shop/[handle]) accepts ONLY its documented query state — the
 * pagination cursor. Browse-only params (sort/search/filters) are deliberately
 * dropped so a shared browse URL cannot change a storefront's ordering.
 */
export function storefrontRaw(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return typeof raw.cursor === 'string' ? { cursor: raw.cursor } : {};
}

/**
 * Read Next.js searchParams (values may be string | string[]) into the shape
 * `parseBrowseQuery` expects, preserving repeated multi-value params.
 */
export function searchParamsToRaw(
  sp: Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const many = (v: string | string[] | undefined) =>
    v === undefined ? [] : Array.isArray(v) ? v : [v];
  return {
    q: first(sp.q),
    category: first(sp.category),
    gender: first(sp.gender),
    minPrice: first(sp.minPrice),
    maxPrice: first(sp.maxPrice),
    location: first(sp.location),
    sort: first(sp.sort),
    cursor: first(sp.cursor),
    size: many(sp.size),
    condition: many(sp.condition),
  };
}
