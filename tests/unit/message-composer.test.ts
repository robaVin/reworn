import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageComposer } from '@/components/messaging/MessageComposer';
import {
  sendErrorMessage,
  type SendErrorKind,
} from '@/modules/messaging/compose-state';

const CONV_ID = 'c0000000-0000-0000-0000-000000000001';

const html = () =>
  renderToStaticMarkup(
    createElement(MessageComposer, { conversationId: CONV_ID }),
  );

describe('MessageComposer markup', () => {
  it('submits only the allowed fields (conversationId, token, body)', () => {
    const names = (html().match(/name="[^"]+"/g) ?? []).sort();
    expect(names).toEqual([
      'name="body"',
      'name="clientSubmissionId"',
      'name="conversationId"',
    ]);
  });

  it('carries the conversation id and an (initially empty) idempotency token', () => {
    const out = html();
    expect(out).toContain(`name="conversationId" value="${CONV_ID}"`);
    // The token is generated on the client after mount, so SSR renders it empty
    // (no hydration mismatch; a no-JS submit falls back to a plain insert).
    expect(out).toContain('name="clientSubmissionId" value=""');
  });

  it('has a labelled, multiline, length-limited textarea for the body', () => {
    const out = html();
    expect(out).toContain('<label');
    expect(out).toContain('for="message-body"');
    expect(out).toContain('<textarea');
    expect(out).toContain('id="message-body"');
    expect(out).toContain('name="body"');
    expect(out).toMatch(/maxlength="4000"/i); // rendered maxLength; browser-normalised
    expect(out).toContain('aria-describedby');
  });

  it('has a Send submit button and no nested interactive controls', () => {
    const out = html();
    expect(out).toContain('type="submit"');
    expect(out).toContain('Send');
    // No GET method (body never lands in a URL); no nested links.
    expect(out).not.toContain('method="get"');
    expect(out).not.toContain('<a ');
  });

  it('renders no profile/seller ids and no message content', () => {
    const out = html();
    for (const key of [
      'senderProfileId',
      'buyerProfileId',
      'sellerProfileId',
      'profileId',
      'sellerId',
      'email',
    ]) {
      expect(out).not.toContain(key);
    }
  });
});

describe('sendErrorMessage copy', () => {
  it('is specific for the common validation failures and generic otherwise', () => {
    expect(sendErrorMessage('empty')).toBe('Enter a message.');
    expect(sendErrorMessage('tooLong')).toBe(
      'Messages can contain up to 4000 characters.',
    );
    expect(sendErrorMessage('controlChar')).toBe(
      'This message contains unsupported characters.',
    );
    for (const kind of [
      'notFound',
      'validationError',
      'unexpected',
    ] as SendErrorKind[]) {
      const msg = sendErrorMessage(kind);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i); // no uuid
      expect(msg.toLowerCase()).not.toContain('prisma');
      expect(msg.toLowerCase()).not.toContain('sql');
    }
  });
});
