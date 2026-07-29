import { describe, it, expect } from 'vitest';
import { metadata } from '@/app/messages/page';

/**
 * The inbox is authenticated, private content: it must be noindex,nofollow and
 * carry a bare self-canonical so paginated (?cursor=) URLs are never promoted.
 */
describe('/messages metadata', () => {
  it('is noindex, nofollow', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('has a bare /messages canonical (no cursor)', () => {
    expect(metadata.alternates?.canonical).toBe('/messages');
  });

  it('has the Messages title', () => {
    expect(metadata.title).toBe('Messages');
  });
});
