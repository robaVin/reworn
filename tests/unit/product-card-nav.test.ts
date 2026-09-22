import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  productHref,
  publicCardToListingCard,
} from '@/components/marketplace/listing-card-data';
import { ListingCard } from '@/components/marketplace/ListingCard';
import type { PublicListingCard } from '@/modules/catalog/public-catalog';

const card: PublicListingCard = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'silk-slip-dress-abc12345',
  title: 'Silk Slip Dress',
  brand: 'Studio Nord',
  size: 'S',
  condition: 'like_new',
  gender: 'women',
  priceMinor: 12000,
  currency: 'EUR',
  categorySlug: 'dresses',
  categoryName: 'Dresses',
  coverUrl: null,
};

describe('productHref', () => {
  it('prefers the canonical product slug URL', () => {
    expect(productHref({ slug: 'x-abc12345', id: 'irrelevant' })).toBe(
      '/products/x-abc12345',
    );
  });

  it('falls back to the legacy id route only when no slug exists', () => {
    expect(productHref({ slug: null, id: 'the-id' })).toBe('/listing/the-id');
  });
});

describe('publicCardToListingCard', () => {
  it('carries the slug through to the card view model', () => {
    expect(publicCardToListingCard(card).slug).toBe('silk-slip-dress-abc12345');
  });
});

describe('ListingCard link', () => {
  it('renders a single canonical product link (the save heart adds its own control)', () => {
    const view = publicCardToListingCard(card);
    const html = renderToStaticMarkup(
      createElement(ListingCard, { listing: view, href: productHref(view) }),
    );
    const hrefs = html.match(/href="[^"]+"/g) ?? [];
    // Exactly one navigation link to the listing — canonical slug, no legacy id
    // route. (The anonymous save heart renders a separate /login link, which is
    // not a listing-navigation link and is asserted elsewhere.)
    const navLinks = hrefs.filter(
      (h) => h.startsWith('href="/products/') || h.startsWith('href="/listing/'),
    );
    expect(navLinks).toEqual(['href="/products/silk-slip-dress-abc12345"']);
    expect(html).not.toContain('/listing/');
  });
});
