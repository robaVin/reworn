import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductDetail } from '@/components/marketplace/ProductDetail';
import type { PublicListingDetail } from '@/modules/catalog/public-catalog';

/**
 * Presentational PDP body — rendered to static markup (environment: node). The
 * auth CTA and related products are passed as inert stub slots.
 */

const SELLER_PROFILE_UUID = '99999999-9999-4999-8999-999999999999';
const LISTING_UUID = '11111111-1111-4111-8111-111111111111';

const base: PublicListingDetail = {
  id: LISTING_UUID,
  slug: 'wool-overcoat-abc12345',
  title: 'Wool Overcoat',
  brand: 'Maison Kre',
  size: 'M',
  condition: 'very_good',
  gender: 'men',
  priceMinor: 24000,
  currency: 'EUR',
  categorySlug: 'outerwear',
  categoryName: 'Outerwear',
  coverUrl: 'signed://cover',
  description: 'A lovely coat.',
  color: 'Camel',
  material: 'Wool',
  location: 'Skopje',
  deliveryMethod: 'shipping',
  deliveryNote: 'Ships from Skopje',
  originalPriceMinor: null,
  createdAt: new Date('2026-01-02T00:00:00.000Z'),
  status: 'published',
  seller: {
    handle: 'aurora',
    shopName: 'Aurora Vintage',
    joinedAt: new Date('2025-01-01T00:00:00.000Z'),
  },
  images: [{ url: 'signed://img1', width: 800, height: 800 }],
};

// ProductDetail is an async server component; call it and await its element.
async function render(
  over: Partial<PublicListingDetail> = {},
): Promise<string> {
  return renderToStaticMarkup(
    await ProductDetail({
      listing: { ...base, ...over },
      canonicalPath: '/products/wool-overcoat-abc12345',
      absoluteUrl: 'https://reworn.example/products/wool-overcoat-abc12345',
      cta: createElement('span', { 'data-testid': 'cta' }, 'CTA-SLOT'),
      related: createElement('div', { 'data-testid': 'related' }, 'RELATED'),
    }),
  );
}

describe('ProductDetail content', () => {
  it('renders every required and optional field', async () => {
    const html = await render();
    expect(html).toContain('Wool Overcoat');
    expect(html).toContain('Maison Kre');
    expect(html).toMatch(/240/); // price
    expect(html).toContain('Very good'); // condition label
    expect(html).toContain('Outerwear'); // category
    expect(html).toContain('Men'); // department
    expect(html).toContain('Camel'); // colour
    expect(html).toContain('Wool'); // material
    expect(html).toContain('Skopje'); // location
    expect(html).toContain('A lovely coat.'); // description
    expect(html).toContain('Aurora Vintage'); // seller name
    expect(html).toContain('/shop/aurora'); // seller shop link
    expect(html).toContain('Available'); // availability (text, not colour-only)
    expect(html).toContain('CTA-SLOT'); // message CTA slot
    expect(html).toContain('RELATED'); // related slot
  });

  it('has exactly one H1, a labelled breadcrumb, and a semantic time element', async () => {
    const html = await render();
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('/browse?category=outerwear');
    expect(html).toContain('<time dateTime="2026-01-02T00:00:00.000Z"');
  });

  it('maps each delivery method to its public label', async () => {
    expect(await render({ deliveryMethod: 'unspecified' })).toContain(
      'Arrange delivery directly with the seller',
    );
    expect(await render({ deliveryMethod: 'shipping' })).toContain(
      'Shipping available',
    );
    expect(await render({ deliveryMethod: 'pickup' })).toContain(
      'Collection available',
    );
    expect(await render({ deliveryMethod: 'both' })).toContain(
      'Shipping or collection available',
    );
  });

  it('omits the note when absent and preserves it (with newlines) when present', async () => {
    // Absent: the note text is gone (description is nulled too so the shared
    // `whitespace-pre-line` class isn't a false positive).
    const absent = await render({ deliveryNote: null, description: null });
    expect(absent).not.toContain('Ships from Skopje');
    expect(absent).not.toContain('whitespace-pre-line');

    // Present: both lines survive, rendered in a newline-preserving paragraph.
    const multiline = await render({
      description: null,
      deliveryNote: `Ships Monday${String.fromCharCode(10)}Pickup in Skopje`,
    });
    expect(multiline).toContain('whitespace-pre-line');
    expect(multiline).toContain('Ships Monday');
    expect(multiline).toContain('Pickup in Skopje');
  });

  it('renders HTML-like listing text as inert plain text (no raw markup)', async () => {
    const html = await render({
      description: '</script><img src=x onerror=alert(1)>',
      deliveryNote: '<b>bold</b> & <i>italic</i>',
    });
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<b>bold</b>');
    expect(html).toContain('&lt;'); // escaped entities present instead
  });

  it('falls back to the garment glyph when there are no images', async () => {
    const html = await render({ images: [], coverUrl: null });
    expect(html).toContain('no photo provided');
  });

  it('exposes no internal ids (listing UUID, seller/profile UUID, storage keys)', async () => {
    const html = await render();
    expect(html).not.toContain(LISTING_UUID);
    expect(html).not.toContain(SELLER_PROFILE_UUID);
    expect(html).not.toContain('storage_key');
    expect(html).not.toContain('storageKey');
  });

  it('emits Product JSON-LD with an in-stock offer', async () => {
    const html = await render();
    expect(html).toContain('application/ld+json');
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('https://schema.org/InStock');
  });
});
