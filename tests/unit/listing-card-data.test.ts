import { describe, expect, it } from 'vitest';
import { formatPrice, majorToMinor, minorToMajor } from '@/lib/format';
import {
  publicCardToListingCard,
  hueFromId,
} from '@/components/marketplace/listing-card-data';
import type { PublicListingCard } from '@/modules/catalog/public-catalog';

describe('formatPrice', () => {
  it('formats integer minor units without inventing floats', () => {
    expect(formatPrice(24000, 'EUR')).toMatch(/240/);
    expect(formatPrice(9550, 'EUR')).toMatch(/95/);
  });
});

describe('majorToMinor / minorToMajor', () => {
  it('parses via string arithmetic (no floats) and round-trips', () => {
    expect(majorToMinor('240')).toBe(24000);
    expect(majorToMinor('240.5')).toBe(24050);
    expect(majorToMinor('0.09')).toBe(9);
    expect(majorToMinor('abc')).toBeUndefined();
    expect(majorToMinor('-5')).toBeUndefined();
    expect(minorToMajor(24050)).toBe('240.50');
    expect(minorToMajor(600 * 100)).toBe('600');
  });
});

describe('publicCardToListingCard', () => {
  const base: PublicListingCard = {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'wool-coat-00000000',
    title: 'Wool coat',
    brand: 'Zegna',
    size: 'M',
    condition: 'very_good',
    gender: 'men',
    priceMinor: 24000,
    currency: 'MKD',
    categorySlug: 'clothing',
    categoryName: 'Clothing',
    coverUrl: 'signed://x',
  };

  it('maps a public card to the view model with a condition label', () => {
    const card = publicCardToListingCard(base);
    expect(card).toMatchObject({
      id: base.id,
      title: 'Wool coat',
      brand: 'Zegna',
      size: 'M',
      category: 'Clothing',
      condition: 'Very good',
      priceMinor: 24000,
      currency: 'MKD',
      imageUrl: 'signed://x',
    });
    expect(card.tintHue).toBeGreaterThanOrEqual(0);
    expect(card.tintHue).toBeLessThan(360);
  });

  it('coerces nullable fields to safe defaults', () => {
    const card = publicCardToListingCard({
      ...base,
      brand: null,
      size: null,
      condition: null,
      categoryName: null,
      coverUrl: null,
      priceMinor: null,
    });
    expect(card.brand).toBe('');
    expect(card.size).toBe('');
    expect(card.condition).toBe('');
    expect(card.category).toBe('');
    expect(card.imageUrl).toBeNull();
    expect(card.priceMinor).toBe(0);
  });

  it('hueFromId is deterministic and in range', () => {
    expect(hueFromId('abc')).toBe(hueFromId('abc'));
    expect(hueFromId('abc')).toBeGreaterThanOrEqual(0);
    expect(hueFromId('abc')).toBeLessThan(360);
  });
});
