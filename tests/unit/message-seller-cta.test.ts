import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageSellerCta } from '@/components/marketplace/MessageSellerCta';

// The suite runs in `environment: node`; render the CTA to static markup with
// react-dom/server (no jsdom needed) and assert on the HTML.

const LISTING_ID = '11111111-1111-1111-1111-111111111111';

const markup = (state: 'guest' | 'owner' | 'buyer') =>
  renderToStaticMarkup(
    createElement(MessageSellerCta, { listingId: LISTING_ID, state }),
  );

describe('MessageSellerCta', () => {
  it('owner sees a non-interactive "your listing" note (no form, no submit)', () => {
    const html = markup('owner');
    expect(html).toContain('This is your listing');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="submit"');
  });

  it('guest sees a sign-in link that returns to this listing', () => {
    const html = markup('guest');
    expect(html).toContain('href="/login?next=');
    expect(html).toContain(encodeURIComponent(`/listing/${LISTING_ID}`));
    expect(html).not.toContain('<form');
  });

  it('guest with a returnPath returns to the canonical product URL', () => {
    const html = renderToStaticMarkup(
      createElement(MessageSellerCta, {
        listingId: LISTING_ID,
        state: 'guest',
        returnPath: '/products/wool-overcoat-abc12345',
      }),
    );
    expect(html).toContain(
      encodeURIComponent('/products/wool-overcoat-abc12345'),
    );
    expect(html).not.toContain(encodeURIComponent(`/listing/${LISTING_ID}`));
  });

  it('buyer sees a form whose ONLY field is the listing id', () => {
    const html = markup('buyer');
    expect(html).toContain('<form');
    expect(html).toContain('name="listingId"');
    expect(html).toContain(`value="${LISTING_ID}"`);
    // No other named form fields (no participant ids).
    const names = html.match(/name="[^"]+"/g) ?? [];
    expect(names).toEqual(['name="listingId"']);
    expect(html).toContain('Message seller');
  });

  it('no CTA state leaks a profile, seller, or auth id', () => {
    for (const state of ['guest', 'owner', 'buyer'] as const) {
      const html = markup(state);
      for (const key of [
        'buyerProfileId',
        'sellerProfileId',
        'senderProfileId',
        'profileId',
        'sellerId',
        'ownerId',
        'email',
      ]) {
        expect(html).not.toContain(key);
      }
    }
  });
});
