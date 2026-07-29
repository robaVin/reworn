import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// next/image couples to the runtime image config; stub it to a plain <img> so
// this test exercises only the card's own branching/markup.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    createElement('img', {
      src: props.src as string,
      alt: (props.alt as string) ?? '',
    }),
}));

const { InboxCard } = await import('@/components/messaging/InboxCard');
type Summary = Parameters<typeof InboxCard>[0]['conversation'];

const LISTING_ID = 'a0000000-0000-0000-0000-0000000000aa';

const base: Summary = {
  id: 'c0000000-0000-0000-0000-000000000001',
  listing: {
    id: LISTING_ID,
    title: 'Wool Overcoat',
    priceMinor: 12000,
    currency: 'MKD',
    status: 'published',
    coverUrl: 'https://proj.supabase.co/storage/v1/object/sign/cover.webp',
  },
  counterparty: {
    kind: 'seller',
    displayName: 'Nordic Thrift',
    handle: 'nordic-thrift',
  },
  lastMessagePreview: 'Is this still available?',
  lastActivityAt: new Date('2026-07-29T10:00:00.000Z'),
};

const render = (c: Summary) =>
  renderToStaticMarkup(createElement(InboxCard, { conversation: c }));

describe('InboxCard', () => {
  it('renders a populated seller conversation with a thumbnail and machine-readable time', () => {
    const html = render(base);
    expect(html).toContain('Nordic Thrift');
    expect(html).toContain('@nordic-thrift');
    expect(html).toContain('Wool Overcoat');
    expect(html).toContain('Is this still available?');
    expect(html).toMatch(/<time[^>]*="2026-07-29T10:00:00\.000Z"/i); // machine-readable
    expect(html).toContain('Jul 29, 2026'); // human-readable label
    expect(html).toContain('<img'); // cover shown
    expect(html).not.toContain('No image');
  });

  it('shows a placeholder and no image when the cover is missing', () => {
    const html = render({
      ...base,
      listing: { ...base.listing, coverUrl: null },
    });
    expect(html).toContain('No image');
    expect(html).not.toContain('<img');
  });

  it('marks a removed listing and falls back to its snapshot title', () => {
    const html = render({
      ...base,
      listing: {
        id: null,
        title: 'Vintage Denim (snapshot)',
        priceMinor: 8000,
        currency: 'MKD',
        status: 'removed',
        coverUrl: null,
      },
    });
    expect(html).toContain('Vintage Denim (snapshot)');
    expect(html).toContain('no longer available');
    expect(html).toContain('No image');
  });

  it('does not show a handle for a buyer counterparty', () => {
    const html = render({
      ...base,
      counterparty: { kind: 'buyer', displayName: 'ReWorn member' },
    });
    expect(html).toContain('ReWorn member');
    expect(html).not.toContain('@');
  });

  it('shows a neutral note when there is no message yet', () => {
    const html = render({ ...base, lastMessagePreview: null });
    expect(html).toContain('No messages yet');
  });

  it('never renders a profile/seller/buyer id, listing id, or email', () => {
    const html = render(base);
    expect(html).not.toContain(LISTING_ID); // the listing id is not rendered
    for (const key of [
      'buyerProfileId',
      'sellerProfileId',
      'senderProfileId',
      'profileId',
      'sellerId',
      'email',
    ]) {
      expect(html).not.toContain(key);
    }
  });
});
