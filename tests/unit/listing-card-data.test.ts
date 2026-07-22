import { describe, expect, it } from 'vitest';
import { formatPrice } from '@/lib/format';
import { EDITORIAL_SAMPLE_LISTINGS } from '@/components/home/editorial-samples';

describe('formatPrice', () => {
  it('formats integer minor units without inventing floats', () => {
    expect(formatPrice(24000, 'EUR')).toMatch(/240/);
    expect(formatPrice(9550, 'EUR')).toMatch(/95/);
  });
});

describe('editorial design samples', () => {
  it('are clearly sample ids, not production UUIDs', () => {
    for (const listing of EDITORIAL_SAMPLE_LISTINGS) {
      expect(listing.id.startsWith('sample-')).toBe(true);
    }
  });

  it('include enough cards to validate the grid layout', () => {
    expect(EDITORIAL_SAMPLE_LISTINGS.length).toBeGreaterThanOrEqual(4);
  });
});
