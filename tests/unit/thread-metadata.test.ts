import { describe, it, expect } from 'vitest';
import { generateMetadata } from '@/app/messages/[conversationId]/page';

const CONV_ID = 'c0000000-0000-0000-0000-000000000001';

/**
 * The thread route uses GENERIC static metadata: it must not load or leak any
 * private conversation data (counterparty, listing title, message bodies), and
 * must be noindex,nofollow with a bare canonical to the route.
 */
describe('/messages/[conversationId] metadata', () => {
  it('is generic, noindex, and canonical to the route only', async () => {
    const md = await generateMetadata({
      params: Promise.resolve({ conversationId: CONV_ID }),
    });
    expect(md.title).toBe('Conversation — ReWorn');
    expect(md.robots).toMatchObject({ index: false, follow: false });
    expect(md.alternates?.canonical).toBe(`/messages/${CONV_ID}`);
    // No Open Graph, and nothing beyond the canonical route id.
    expect(md.openGraph).toBeUndefined();
    const serialized = JSON.stringify(md);
    // The only occurrence of the id is the canonical path.
    expect(serialized.split(CONV_ID).length - 1).toBe(1);
  });
});
