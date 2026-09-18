/**
 * Free-text → canonical category resolution.
 *
 * Lets the browse search box match a listing by its CATEGORY in addition to the
 * full-text fields (title/brand/material/description in `search_vector`). A user
 * typing "shoes" — or the Albanian/Macedonian equivalent — surfaces listings in
 * the Shoes category without selecting the category filter.
 *
 * This is a small, fixed alias map (mirrors prisma/seed.ts CATEGORIES) so
 * localized category search works WITHOUT a database migration or translated
 * category columns: a localized term maps back to the canonical slug, which the
 * existing category_id query already understands. Keep in sync with the seeded
 * categories (and messages/*.json) if the category set changes.
 *
 * Pure and dependency-free (unit-testable; safe to import anywhere).
 */
export interface CategoryAlias {
  slug: string;
  /** Lower-cased category names across en / sq / mk (+ ASCII fallbacks). */
  terms: string[];
}

export const CATEGORY_ALIASES: readonly CategoryAlias[] = [
  { slug: 'clothing', terms: ['clothing', 'veshje', 'облека'] },
  { slug: 'shoes', terms: ['shoes', 'këpucë', 'kepuce', 'обувки'] },
  { slug: 'bags', terms: ['bags', 'çanta', 'canta', 'чанти'] },
  {
    slug: 'accessories',
    terms: ['accessories', 'aksesorë', 'aksesore', 'додатоци'],
  },
  { slug: 'jewelry', terms: ['jewelry', 'bizhuteri', 'накит'] },
];

/**
 * Canonical category slugs whose (localized) name matches the free-text query.
 * Case-insensitive, whitespace-trimmed, and diacritic-tolerant via the ASCII
 * fallbacks in the alias map. Requires ≥2 chars to avoid a single letter
 * matching many categories. Returns [] for an empty/short/non-matching query,
 * so the caller only ever ADDs a category clause — never removes text search.
 */
export function resolveCategorySlugsFromQuery(q: string): string[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const slugs = new Set<string>();
  for (const { slug, terms } of CATEGORY_ALIASES) {
    // Match when the query is contained in a category term ("shoe" → "shoes")
    // or the term is contained in the query ("shoesss" still resolves).
    if (terms.some((t) => t.includes(needle) || needle.includes(t))) {
      slugs.add(slug);
    }
  }
  return [...slugs];
}
