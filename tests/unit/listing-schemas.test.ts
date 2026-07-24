import { describe, it, expect } from 'vitest';
import {
  createListingSchema,
  updateListingSchema,
} from '@/modules/catalog/schemas';

const valid = {
  title: '  Wool Overcoat  ',
  description: 'A warm wool coat in excellent condition.',
  categoryId: '11111111-1111-1111-1111-111111111111',
  size: 'M',
  condition: 'very_good' as const,
  priceMinor: 24000,
  location: 'Skopje',
};

describe('createListingSchema', () => {
  it('accepts valid input and applies defaults', () => {
    const r = createListingSchema.parse(valid);
    expect(r.title).toBe('Wool Overcoat'); // trimmed
    expect(r.currency).toBe('MKD'); // default
    expect(r.gender).toBe('unisex'); // default
  });

  it('upper-cases the currency', () => {
    const r = createListingSchema.parse({ ...valid, currency: 'eur' });
    expect(r.currency).toBe('EUR');
  });

  it('normalises empty optional strings to undefined', () => {
    const r = createListingSchema.parse({ ...valid, brand: '  ', color: '' });
    expect(r.brand).toBeUndefined();
    expect(r.color).toBeUndefined();
  });

  it('rejects a negative price', () => {
    expect(
      createListingSchema.safeParse({ ...valid, priceMinor: -1 }).success,
    ).toBe(false);
  });

  it('rejects a non-integer price', () => {
    expect(
      createListingSchema.safeParse({ ...valid, priceMinor: 12.5 }).success,
    ).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(
      createListingSchema.safeParse({ ...valid, title: '   ' }).success,
    ).toBe(false);
  });

  it('rejects an over-long title', () => {
    expect(
      createListingSchema.safeParse({ ...valid, title: 'x'.repeat(141) })
        .success,
    ).toBe(false);
  });

  it('rejects a bad category id', () => {
    expect(
      createListingSchema.safeParse({ ...valid, categoryId: 'not-a-uuid' })
        .success,
    ).toBe(false);
  });

  it('rejects an invalid condition', () => {
    expect(
      createListingSchema.safeParse({ ...valid, condition: 'mint' }).success,
    ).toBe(false);
  });

  it('rejects a non-3-letter currency', () => {
    expect(
      createListingSchema.safeParse({ ...valid, currency: 'MK' }).success,
    ).toBe(false);
  });
});

describe('updateListingSchema', () => {
  it('is a partial (all fields optional)', () => {
    expect(updateListingSchema.safeParse({}).success).toBe(true);
    expect(updateListingSchema.safeParse({ title: 'New title' }).success).toBe(
      true,
    );
  });

  it('still validates provided fields', () => {
    expect(updateListingSchema.safeParse({ priceMinor: -5 }).success).toBe(
      false,
    );
  });
});
