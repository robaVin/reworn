import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) =>
    createElement('img', {
      src: props.src as string,
      alt: (props.alt as string) ?? '',
    }),
}));

const { ConversationHeader } =
  await import('@/components/messaging/ConversationHeader');
const { ConversationMessages } =
  await import('@/components/messaging/ConversationMessages');
const { InboxCard } = await import('@/components/messaging/InboxCard');

type Ctx = Parameters<typeof ConversationHeader>[0]['context'];
type Msg = Parameters<typeof ConversationMessages>[0]['messages'][number];

const CONV_ID = 'c0000000-0000-0000-0000-000000000001';
const LISTING_ID = 'a0000000-0000-0000-0000-0000000000aa';

const ctx = (over: Partial<Ctx['listing']> = {}): Ctx => ({
  id: CONV_ID,
  listing: {
    id: LISTING_ID,
    title: 'Wool Overcoat',
    priceMinor: 12000,
    currency: 'MKD',
    status: 'published',
    coverUrl: 'https://proj.supabase.co/storage/v1/object/sign/cover.webp',
    ...over,
  },
  counterparty: {
    kind: 'seller',
    displayName: 'Nordic Thrift',
    handle: 'nordic-thrift',
  },
  lastActivityAt: new Date('2026-07-29T10:00:00.000Z'),
});

const headerHtml = (c: Ctx) =>
  renderToStaticMarkup(createElement(ConversationHeader, { context: c }));

describe('ConversationHeader', () => {
  it('links a PUBLISHED listing to /listing/[id] and shows the seller handle', () => {
    const html = headerHtml(ctx());
    expect(html).toContain('Nordic Thrift');
    expect(html).toContain('href="/shop/nordic-thrift"');
    expect(html).toContain(`href="/listing/${LISTING_ID}"`);
    expect(html).toContain('View listing');
    expect(html).toContain('<img'); // signed cover
  });

  it('does NOT link a paused/archived listing (would 404 publicly)', () => {
    for (const status of ['paused', 'archived'] as const) {
      const html = headerHtml(ctx({ status }));
      expect(html).not.toContain(`href="/listing/${LISTING_ID}"`);
      expect(html).toContain('not currently available');
    }
  });

  it('uses the snapshot and shows no public link for a REMOVED listing', () => {
    const html = headerHtml(
      ctx({ id: null, status: 'removed', coverUrl: null, title: 'Gone Coat' }),
    );
    expect(html).toContain('Gone Coat');
    expect(html).toContain('no longer available');
    expect(html).not.toContain('href="/listing/');
    expect(html).toContain('No image');
    expect(html).not.toContain('<img');
  });

  it('never renders a profile/seller/owner id', () => {
    const html = headerHtml(ctx());
    for (const key of [
      'sellerProfileId',
      'buyerProfileId',
      'profileId',
      'sellerId',
      'ownerId',
      'email',
    ]) {
      expect(html).not.toContain(key);
    }
  });
});

const msg = (over: Partial<Msg>): Msg => ({
  id: 'm0000000-0000-0000-0000-000000000001',
  body: 'Hello there',
  createdAt: new Date('2026-07-29T10:00:00.000Z'),
  sentByViewer: false,
  ...over,
});

const listHtml = (messages: Msg[]) =>
  renderToStaticMarkup(
    createElement(ConversationMessages, {
      messages,
      counterpartyName: 'Nordic Thrift',
    }),
  );

describe('ConversationMessages', () => {
  it('renders a truthful empty state with no composer', () => {
    const html = listHtml([]);
    expect(html).toContain('No messages yet.');
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('<form');
  });

  it('labels the viewer as "You" and the counterparty by public name', () => {
    const html = listHtml([
      msg({ id: 'm1', body: 'mine', sentByViewer: true }),
      msg({ id: 'm2', body: 'theirs', sentByViewer: false }),
    ]);
    expect(html).toContain('You');
    expect(html).toContain('Nordic Thrift');
    expect(html).toContain('<ol'); // ordered/semantic list
    expect(html).toContain('<time'); // per-message timestamp
  });

  it('renders bodies as plain text — HTML-like content is ESCAPED, not injected', () => {
    const html = listHtml([
      msg({ body: '<script>alert(1)</script> & <b>x</b>' }),
    ]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;'); // escaped
  });

  it('preserves intentional newlines and renders Unicode/emoji', () => {
    const html = listHtml([msg({ body: 'line1\nline2\n\nЋао 🧥' })]);
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain('line1\nline2');
    expect(html).toContain('Ћао 🧥');
  });

  it('never renders a sender profile id', () => {
    const html = listHtml([msg({ body: 'hi' })]);
    for (const key of ['senderProfileId', 'sender_profile_id', 'profileId']) {
      expect(html).not.toContain(key);
    }
  });
});

describe('InboxCard link', () => {
  const summary = {
    id: CONV_ID,
    listing: {
      id: LISTING_ID,
      title: 'Wool Overcoat',
      priceMinor: 12000,
      currency: 'MKD',
      status: 'published',
      coverUrl: null,
    },
    counterparty: {
      kind: 'seller' as const,
      displayName: 'Nordic Thrift',
      handle: 'nordic-thrift',
    },
    lastMessagePreview: 'Is this available?',
    lastActivityAt: new Date('2026-07-29T10:00:00.000Z'),
  };

  it('is a SINGLE primary link to the thread with a descriptive accessible name', () => {
    const html = renderToStaticMarkup(
      createElement(InboxCard, { conversation: summary }),
    );
    expect(html).toContain(`href="/messages/${CONV_ID}"`);
    expect(html).toContain(
      'aria-label="Conversation with Nordic Thrift about Wool Overcoat"',
    );
    // Exactly one anchor; no nested interactive controls.
    expect(html.match(/<a\b/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('<button');
  });
});
