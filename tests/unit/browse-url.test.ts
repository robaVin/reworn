import { describe, it, expect } from 'vitest';
import { parseBrowseQuery } from '@/modules/catalog/browse-query';
import {
  buildBrowseHref,
  searchParamsToRaw,
  defaultSortFor,
} from '@/modules/catalog/browse-url';

const parseUrl = (qs: string) => {
  const sp = new URLSearchParams(qs);
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(sp.keys())) {
    const all = sp.getAll(key);
    raw[key] = all.length > 1 ? all : all[0]!;
  }
  return parseBrowseQuery(searchParamsToRaw(raw));
};

describe('buildBrowseHref', () => {
  it('an empty query is the bare /browse URL', () => {
    expect(buildBrowseHref(parseBrowseQuery({}))).toBe('/browse');
  });

  it('serializes filters canonically (sorted multi-values, no cursor)', () => {
    const query = parseBrowseQuery({
      category: 'shoes',
      size: ['L', 'M'],
      condition: ['good', 'new'],
      gender: 'men',
      minPrice: '1000',
      maxPrice: '9000',
      location: 'Skopje',
    });
    expect(buildBrowseHref(query)).toBe(
      '/browse?category=shoes&gender=men&size=L&size=M&condition=good&condition=new&minPrice=1000&maxPrice=9000&location=skopje',
    );
  });

  it('never includes a cursor unless one is explicitly provided (filter change resets pages)', () => {
    const query = parseBrowseQuery({ category: 'shoes', cursor: 'abc' });
    expect(buildBrowseHref(query)).not.toContain('cursor');
  });

  it('pagination keeps all filters and adds the cursor', () => {
    const query = parseBrowseQuery({ category: 'shoes', gender: 'men' });
    const href = buildBrowseHref(query, { cursor: 'CUR' });
    expect(href).toContain('category=shoes');
    expect(href).toContain('gender=men');
    expect(href).toContain('cursor=CUR');
  });

  it('omits the sort when it equals the implied default, keeps it otherwise', () => {
    expect(buildBrowseHref(parseBrowseQuery({}))).not.toContain('sort');
    expect(buildBrowseHref(parseBrowseQuery({ q: 'wool' }))).not.toContain(
      'sort=',
    ); // relevance is default with a query
    expect(buildBrowseHref(parseBrowseQuery({ sort: 'price_asc' }))).toContain(
      'sort=price_asc',
    );
  });

  it('defaultSortFor is relevance with a query, newest without', () => {
    expect(defaultSortFor({ q: 'x' })).toBe('relevance');
    expect(defaultSortFor({ q: undefined })).toBe('newest');
  });
});

describe('URL round-trip (shared links reproduce state)', () => {
  it('a shared URL parses then rebuilds to the same canonical URL', () => {
    const original =
      'category=shoes&gender=women&size=M&size=S&condition=new&minPrice=500&maxPrice=8000&location=bitola&sort=price_desc';
    const query = parseUrl(original);
    const rebuilt = buildBrowseHref(query);
    // Re-parsing the rebuilt URL yields an identical query (idempotent).
    expect(buildBrowseHref(parseUrl(rebuilt.split('?')[1] ?? ''))).toBe(
      rebuilt,
    );
    expect(rebuilt).toContain('sort=price_desc');
  });

  it('normalizes duplicate multi-values', () => {
    const query = parseUrl(
      'size=M&size=M&size=L&condition=good&condition=good',
    );
    expect(query.sizes.sort()).toEqual(['L', 'M']);
    expect(query.conditions).toEqual(['good']);
    expect(buildBrowseHref(query)).toBe('/browse?size=L&size=M&condition=good');
  });

  it('drops unknown params and invalid values (never reach the DB)', () => {
    const query = parseUrl('evil=1&gender=martian&sort=DROP&minPrice=-5');
    expect(query.gender).toBeUndefined();
    expect(query.sort).toBe('newest');
    expect(query.minPrice).toBeUndefined(); // negative rejected
    expect(buildBrowseHref(query)).toBe('/browse'); // nothing valid survived
  });

  it('clearing filters yields the bare /browse URL', () => {
    expect(buildBrowseHref(parseUrl(''))).toBe('/browse');
  });
});
