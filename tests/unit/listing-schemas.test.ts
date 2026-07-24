import { describe, it, expect } from 'vitest';
import {
  draftListingSchema,
  publishableListingSchema,
  updateListingSchema,
} from '@/modules/catalog/schemas';

const complete = {
  title: '  Wool Overcoat  ',
  description: 'A warm wool coat in excellent condition.',
  categoryId: '11111111-1111-1111-1111-111111111111',
  size: 'M',
  condition: 'very_good' as const,
  priceMinor: 24000,
  location: 'Skopje',
};

describe('draftListingSchema (lenient)', () => {
  it('accepts a title-only draft (everything else optional)', () => {
    const r = draftListingSchema.parse({ title: 'Just a title' });
    expect(r.title).toBe('Just a title');
    expect(r.currency).toBe('MKD'); // default
    expect(r.gender).toBe('unisex'); // default
    expect(r.priceMinor).toBeUndefined();
    expect(r.categoryId).toBeUndefined();
  });

  it('still requires a title', () => {
    expect(draftListingSchema.safeParse({}).success).toBe(false);
    expect(draftListingSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('validates fields that ARE provided', () => {
    expect(
      draftListingSchema.safeParse({ title: 'x', priceMinor: -1 }).success,
    ).toBe(false);
    expect(
      draftListingSchema.safeParse({ title: 'x', categoryId: 'nope' }).success,
    ).toBe(false);
    expect(
      draftListingSchema.safeParse({ title: 'x', condition: 'mint' }).success,
    ).toBe(false);
  });

  it('normalises empty optional strings to undefined and trims/upper-cases', () => {
    const r = draftListingSchema.parse({
      title: 'x',
      brand: '  ',
      currency: 'eur',
    });
    expect(r.brand).toBeUndefined();
    expect(r.currency).toBe('EUR');
  });
});

describe('publishableListingSchema (strict)', () => {
  it('accepts a complete listing', () => {
    const r = publishableListingSchema.parse(complete);
    expect(r.title).toBe('Wool Overcoat');
  });

  it.each([
    'description',
    'categoryId',
    'size',
    'condition',
    'priceMinor',
    'location',
  ])('rejects when %s is missing', (field) => {
    const partial: Record<string, unknown> = { ...complete };
    delete partial[field];
    const res = publishableListingSchema.safeParse(partial);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.flatten().fieldErrors).toHaveProperty(field);
    }
  });

  it('rejects an invalid price/condition even when present', () => {
    expect(
      publishableListingSchema.safeParse({ ...complete, priceMinor: 12.5 })
        .success,
    ).toBe(false);
    expect(
      publishableListingSchema.safeParse({ ...complete, condition: 'mint' })
        .success,
    ).toBe(false);
  });
});

describe('updateListingSchema', () => {
  it('is fully partial (title optional too)', () => {
    expect(updateListingSchema.safeParse({}).success).toBe(true);
    expect(updateListingSchema.safeParse({ priceMinor: 100 }).success).toBe(
      true,
    );
  });
  it('still validates provided fields', () => {
    expect(updateListingSchema.safeParse({ priceMinor: -5 }).success).toBe(
      false,
    );
  });
});
