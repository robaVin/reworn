import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SaveButton } from '@/components/marketplace/SaveButton';

// Isolate rendering from the server action chain (prisma / server-only).
vi.mock('@/modules/saved/actions', () => ({
  saveListingAction: vi.fn(async () => ({ ok: true, data: { saved: true } })),
  unsaveListingAction: vi.fn(async () => ({
    ok: true,
    data: { saved: false },
  })),
}));

const LISTING = '11111111-1111-1111-1111-111111111111';

const render = (props: Parameters<typeof SaveButton>[0]) =>
  renderToStaticMarkup(createElement(SaveButton, props));

describe('SaveButton', () => {
  it('anonymous: renders a login link preserving a safe return path', () => {
    const html = render({
      listingId: LISTING,
      initialSaved: false,
      authenticated: false,
      returnPath: '/products/wool-coat-abc123',
    });
    expect(html).toContain('<a');
    expect(html).toContain('href="/login?next=%2Fproducts%2Fwool-coat-abc123"');
    expect(html).toContain('aria-label="Save item"'); // localized (en mock)
    expect(html).not.toContain('<button'); // no mutation control when logged out
  });

  it('authenticated + not saved: outline heart, aria-pressed false', () => {
    const html = render({
      listingId: LISTING,
      initialSaved: false,
      authenticated: true,
      returnPath: '/browse',
    });
    expect(html).toContain('<button');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save item"');
    expect(html).toContain('fill="none"'); // outline heart — shape, not colour
  });

  it('authenticated + saved: filled heart, remove label, aria-pressed true', () => {
    const html = render({
      listingId: LISTING,
      initialSaved: true,
      authenticated: true,
      returnPath: '/browse',
    });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Remove from saved items"');
    expect(html).toContain('fill="currentColor"'); // filled heart
  });
});
