import { describe, it, expect } from 'vitest';
import { buildProductJsonLd } from '@/modules/catalog/product-jsonld';
import { safeJsonLdString } from '@/lib/structured-data';
import type { PublicListingDetail } from '@/modules/catalog/public-catalog';

const base: PublicListingDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'wool-overcoat-abc12345',
  title: 'Wool Overcoat',
  brand: 'Maison Kre',
  size: 'M',
  condition: 'very_good',
  gender: 'men',
  priceMinor: 24050,
  currency: 'EUR',
  categorySlug: 'outerwear',
  categoryName: 'Outerwear',
  coverUrl: 'signed://cover',
  description: 'A lovely coat.',
  color: 'Camel',
  material: 'Wool',
  location: 'Skopje',
  deliveryMethod: 'shipping',
  deliveryNote: 'Tracked post',
  originalPriceMinor: null,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  status: 'published',
  seller: { handle: 'aurora', shopName: 'Aurora', joinedAt: new Date() },
  images: [{ url: 'signed://1', width: 800, height: 800 }],
};

const URL = 'https://reworn.example/products/wool-overcoat-abc12345';

describe('buildProductJsonLd', () => {
  it('emits truthful Product data with an in-stock offer', () => {
    const ld = buildProductJsonLd(base, URL);
    expect(ld['@type']).toBe('Product');
    expect(ld.name).toBe('Wool Overcoat');
    expect(ld.url).toBe(URL);
    expect(ld.brand).toEqual({ '@type': 'Brand', name: 'Maison Kre' });
    expect(ld.category).toBe('Outerwear');
    expect(ld.color).toBe('Camel');
    expect(ld.size).toBe('M');
    expect(ld.itemCondition).toBe('https://schema.org/UsedCondition');
    expect(ld.image).toEqual(['signed://1']);
    expect(ld.offers).toEqual({
      '@type': 'Offer',
      price: '240.50',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: URL,
    });
  });

  it('maps a new item to NewCondition', () => {
    const ld = buildProductJsonLd({ ...base, condition: 'new' }, URL);
    expect(ld.itemCondition).toBe('https://schema.org/NewCondition');
  });

  it('marks a sold listing as SoldOut (not InStock)', () => {
    const ld = buildProductJsonLd({ ...base, status: 'sold' }, URL);
    expect(ld.offers).toMatchObject({
      availability: 'https://schema.org/SoldOut',
    });
  });

  it('omits fields that are absent rather than inventing them', () => {
    const ld = buildProductJsonLd(
      {
        ...base,
        brand: null,
        color: null,
        description: null,
        priceMinor: null,
        images: [],
        coverUrl: null,
      },
      URL,
    );
    expect('brand' in ld).toBe(false);
    expect('color' in ld).toBe(false);
    expect('description' in ld).toBe(false);
    expect('offers' in ld).toBe(false);
    expect('image' in ld).toBe(false);
  });

  it('never claims ratings, reviews, shipping, returns, or inventory', () => {
    const json = JSON.stringify(buildProductJsonLd(base, URL));
    for (const forbidden of [
      'aggregateRating',
      'review',
      'shippingDetails',
      'hasMerchantReturnPolicy',
      'inventoryLevel',
      'seller',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });
});

describe('safeJsonLdString (script-injection safety)', () => {
  it('neutralizes HTML-like listing text so it cannot break out of <script>', () => {
    const hostile: PublicListingDetail = {
      ...base,
      title: '</script><img src=x onerror=alert(1)>',
      description: 'Cats & dogs < > "quotes"',
    };
    const serialized = safeJsonLdString(buildProductJsonLd(hostile, URL));
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    // Still valid JSON that round-trips to the original values.
    const parsed = JSON.parse(serialized) as Record<string, unknown>;
    expect(parsed.name).toBe('</script><img src=x onerror=alert(1)>');
    expect(parsed.description).toBe('Cats & dogs < > "quotes"');
  });
});
