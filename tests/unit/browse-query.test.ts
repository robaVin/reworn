import { describe, it, expect } from 'vitest';
import {
  parseBrowseQuery,
  filterFingerprint,
  MAX_Q_LENGTH,
  MAX_PRICE_MINOR,
} from '@/modules/catalog/browse-query';

describe('parseBrowseQuery — sort', () => {
  it('defaults to newest and only allows whitelisted sorts', () => {
    expect(parseBrowseQuery({}).sort).toBe('newest');
    expect(parseBrowseQuery({ sort: 'price_asc' }).sort).toBe('price_asc');
    expect(parseBrowseQuery({ sort: 'DROP TABLE' }).sort).toBe('newest');
    expect(parseBrowseQuery({ sort: 'created_at' }).sort).toBe('newest');
  });

  it('coerces relevance to newest without a search term', () => {
    expect(parseBrowseQuery({ sort: 'relevance' }).sort).toBe('newest');
    expect(parseBrowseQuery({ sort: 'relevance', q: 'wool' }).sort).toBe(
      'relevance',
    );
  });

  it('defaults to relevance when searching without an explicit sort', () => {
    expect(parseBrowseQuery({ q: 'wool' }).sort).toBe('relevance');
  });
});

describe('parseBrowseQuery — validation', () => {
  it('caps query and location lengths and normalizes case/space', () => {
    const q = parseBrowseQuery({
      q: '  Wool   Coat  ' + 'x'.repeat(200),
      location: '  Skopje ',
    });
    expect(q.q!.length).toBeLessThanOrEqual(MAX_Q_LENGTH);
    expect(q.q!.startsWith('Wool Coat')).toBe(true);
    expect(q.location).toBe('skopje');
  });

  it('dedupes + caps sizes and filters conditions/gender to valid values', () => {
    const q = parseBrowseQuery({
      size: ['M', 'M', 'L'],
      condition: ['new', 'bogus', 'good'],
      gender: 'martian',
    });
    expect(q.sizes.sort()).toEqual(['L', 'M']);
    expect(q.conditions.sort()).toEqual(['good', 'new']);
    expect(q.gender).toBeUndefined();
  });

  it('rejects negative prices, caps huge ones, drops reversed ranges', () => {
    expect(parseBrowseQuery({ minPrice: '-5' }).minPrice).toBeUndefined();
    expect(parseBrowseQuery({ maxPrice: '999999999999' }).maxPrice).toBe(
      MAX_PRICE_MINOR,
    );
    const rev = parseBrowseQuery({ minPrice: '9000', maxPrice: '1000' });
    expect(rev.minPrice).toBeUndefined();
    expect(rev.maxPrice).toBeUndefined();
  });

  it('accepts a valid category slug and rejects a malformed one', () => {
    expect(parseBrowseQuery({ category: 'shoes' }).categorySlug).toBe('shoes');
    expect(
      parseBrowseQuery({ category: 'Bad Slug!' }).categorySlug,
    ).toBeUndefined();
  });
});

describe('filterFingerprint', () => {
  it('is stable regardless of size/condition ordering', () => {
    const a = filterFingerprint(parseBrowseQuery({ size: ['M', 'L'] }));
    const b = filterFingerprint(parseBrowseQuery({ size: ['L', 'M'] }));
    expect(a).toBe(b);
  });

  it('changes when any filter or search changes', () => {
    const base = filterFingerprint(parseBrowseQuery({}));
    expect(filterFingerprint(parseBrowseQuery({ q: 'wool' }))).not.toBe(base);
    expect(filterFingerprint(parseBrowseQuery({ category: 'shoes' }))).not.toBe(
      base,
    );
    expect(filterFingerprint(parseBrowseQuery({ gender: 'men' }))).not.toBe(
      base,
    );
  });

  it('is independent of sort and cursor (carried separately)', () => {
    const a = filterFingerprint(parseBrowseQuery({ sort: 'price_asc' }));
    const b = filterFingerprint(
      parseBrowseQuery({ sort: 'price_desc', cursor: 'abc' }),
    );
    expect(a).toBe(b);
  });
});
