import { describe, it, expect } from 'vitest';
import { generateMetadata } from '@/app/messages/page';

/**
 * The inbox is authenticated, private content: it must be noindex,nofollow and
 * carry a bare self-canonical so paginated (?cursor=) URLs are never promoted.
 * Metadata is now localized via generateMetadata (next-intl is mocked in
 * tests/setup.ts to return the English catalog values).
 */
describe('/messages metadata', () => {
  it('is noindex, nofollow', async () => {
    const metadata = await generateMetadata();
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });

  it('has a bare /messages canonical (no cursor)', async () => {
    const metadata = await generateMetadata();
    expect(metadata.alternates?.canonical).toBe('/messages');
  });

  it('has the localized Messages title', async () => {
    const metadata = await generateMetadata();
    expect(metadata.title).toBe('Messages');
  });
});
