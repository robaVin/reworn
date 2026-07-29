import { describe, it, expect } from 'vitest';
import {
  mapConversationError,
  resolveStartConversation,
} from '@/modules/messaging/conversation-actions';
import { conversationErrorMessage } from '@/modules/messaging/conversation-cta';
import { AuthorizationError } from '@/modules/auth/errors';
import { isSafeRedirectPath } from '@/lib/safe-redirect';

const LISTING = '11111111-1111-1111-1111-111111111111';

describe('mapConversationError', () => {
  it('maps a 404 to notFound (uniform non-disclosure)', () => {
    expect(mapConversationError(new AuthorizationError(404, 'not_found'))).toBe(
      'notFound',
    );
  });

  it('maps a 403 to ownListing', () => {
    expect(
      mapConversationError(
        new AuthorizationError(403, 'cannot_message_own_listing'),
      ),
    ).toBe('ownListing');
  });

  it('maps any other error to unexpected (no raw error surfaced)', () => {
    const kind = mapConversationError(
      new Error('P2010: raw SQL failed near listings'),
    );
    expect(kind).toBe('unexpected');
    // The returned value is a bare kind — it carries no message/stack.
    expect(JSON.stringify(kind)).not.toContain('SQL');
  });
});

describe('resolveStartConversation — pre-service branches (no DB)', () => {
  it('missing / empty listing id is a validationError', async () => {
    expect(await resolveStartConversation('user', null)).toEqual({
      kind: 'error',
      error: 'validationError',
    });
    expect(await resolveStartConversation('user', '')).toEqual({
      kind: 'error',
      error: 'validationError',
    });
    expect(await resolveStartConversation('user', 42)).toEqual({
      kind: 'error',
      error: 'validationError',
    });
  });

  it('an unauthenticated request redirects to sign-in, NOT to a conversation', async () => {
    const out = await resolveStartConversation(null, LISTING);
    expect(out).toEqual({
      kind: 'redirect',
      to: `/login?next=${encodeURIComponent(`/listing/${LISTING}`)}`,
    });
    // Never a /messages target before auth completes.
    if (out.kind === 'redirect') expect(out.to).not.toContain('/messages/');
  });

  it('the sign-in return path is always a SAFE internal path (no open redirect)', async () => {
    // Even a tampered listing id cannot produce an external/protocol-relative
    // redirect, because the return path is always prefixed with /listing/.
    for (const evil of [
      '//evil.com',
      'https://evil.com',
      '/\\evil.com',
      '../../account',
    ]) {
      const out = await resolveStartConversation(null, evil);
      if (out.kind !== 'redirect') throw new Error('expected redirect');
      const next = decodeURIComponent(out.to.replace('/login?next=', ''));
      expect(next.startsWith('/listing/')).toBe(true);
      expect(isSafeRedirectPath(next)).toBe(true); // internal, same-origin
    }
  });
});

describe('conversationErrorMessage', () => {
  it('returns generic, id-free copy for every kind', () => {
    for (const kind of [
      'notFound',
      'ownListing',
      'validationError',
      'unexpected',
    ] as const) {
      const msg = conversationErrorMessage(kind);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no uuid
      expect(msg.toLowerCase()).not.toContain('profile');
      expect(msg.toLowerCase()).not.toContain('sql');
    }
  });
});
