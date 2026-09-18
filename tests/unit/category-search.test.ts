import { describe, it, expect } from 'vitest';
import {
  resolveCategorySlugsFromQuery,
  CATEGORY_ALIASES,
} from '@/modules/catalog/category-search';

/**
 * Free-text → canonical category resolution (FIX 2). Pure logic; the SQL
 * behavior (OR with full-text, AND with an explicit filter) is covered in
 * tests/integration/public-catalog.test.ts.
 */
describe('resolveCategorySlugsFromQuery', () => {
  it('resolves the English category term (case-insensitive, trimmed)', () => {
    expect(resolveCategorySlugsFromQuery('shoes')).toEqual(['shoes']);
    expect(resolveCategorySlugsFromQuery('SHOES')).toEqual(['shoes']);
    expect(resolveCategorySlugsFromQuery('  Shoes  ')).toEqual(['shoes']);
    expect(resolveCategorySlugsFromQuery('shoe')).toEqual(['shoes']); // partial
  });

  it('resolves Albanian terms (with and without diacritics)', () => {
    expect(resolveCategorySlugsFromQuery('Këpucë')).toEqual(['shoes']);
    expect(resolveCategorySlugsFromQuery('kepuce')).toEqual(['shoes']);
    expect(resolveCategorySlugsFromQuery('çanta')).toEqual(['bags']);
    expect(resolveCategorySlugsFromQuery('bizhuteri')).toEqual(['jewelry']);
  });

  it('resolves Macedonian (Cyrillic) terms', () => {
    expect(resolveCategorySlugsFromQuery('Обувки')).toEqual(['shoes']);
    expect(resolveCategorySlugsFromQuery('облека')).toEqual(['clothing']);
    expect(resolveCategorySlugsFromQuery('Накит')).toEqual(['jewelry']);
  });

  it('returns [] for unrelated, empty, or too-short queries', () => {
    expect(resolveCategorySlugsFromQuery('camera')).toEqual([]);
    expect(resolveCategorySlugsFromQuery('')).toEqual([]);
    expect(resolveCategorySlugsFromQuery('  ')).toEqual([]);
    expect(resolveCategorySlugsFromQuery('a')).toEqual([]); // < 2 chars
  });

  it('every canonical slug in the alias map is unique', () => {
    const slugs = CATEGORY_ALIASES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
