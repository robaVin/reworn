import { describe, it, expect } from 'vitest';
import {
  encodeMessageCursor,
  decodeMessageCursor,
  encodeSummaryCursor,
  decodeSummaryCursor,
} from '@/modules/messaging/cursor';

const CONV_A = '11111111-1111-1111-1111-111111111111';
const CONV_B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MSG_ID = '33333333-3333-3333-3333-333333333333';
const NOW = '2026-07-29T12:00:00.000Z';

const b64 = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');

describe('message cursor', () => {
  it('round-trips within the same conversation', () => {
    const raw = encodeMessageCursor(CONV_A, { createdAt: NOW, id: MSG_ID });
    expect(decodeMessageCursor(raw, CONV_A)).toEqual({
      createdAt: NOW,
      id: MSG_ID,
    });
  });

  it('is rejected when replayed against a different conversation', () => {
    const raw = encodeMessageCursor(CONV_A, { createdAt: NOW, id: MSG_ID });
    expect(decodeMessageCursor(raw, CONV_B)).toBeNull();
  });

  it('rejects an undefined / malformed base64 / invalid JSON cursor', () => {
    expect(decodeMessageCursor(undefined, CONV_A)).toBeNull();
    expect(decodeMessageCursor('!!!not base64!!!', CONV_A)).toBeNull();
    expect(
      decodeMessageCursor(
        Buffer.from('not json', 'utf8').toString('base64url'),
        CONV_A,
      ),
    ).toBeNull();
  });

  it('rejects an unknown version', () => {
    const raw = b64({ v: 99, c: CONV_A, t: NOW, id: MSG_ID });
    expect(decodeMessageCursor(raw, CONV_A)).toBeNull();
  });

  it('rejects an invalid timestamp or invalid uuid', () => {
    expect(
      decodeMessageCursor(
        b64({ v: 1, c: CONV_A, t: 'not-a-date', id: MSG_ID }),
        CONV_A,
      ),
    ).toBeNull();
    expect(
      decodeMessageCursor(
        b64({ v: 1, c: CONV_A, t: NOW, id: 'not-a-uuid' }),
        CONV_A,
      ),
    ).toBeNull();
  });
});

describe('summary cursor', () => {
  it('round-trips for the same participant', () => {
    const raw = encodeSummaryCursor(USER_A, {
      lastMessageAt: NOW,
      id: CONV_A,
    });
    expect(decodeSummaryCursor(raw, USER_A)).toEqual({
      lastMessageAt: NOW,
      id: CONV_A,
    });
  });

  it('is rejected when replayed by another participant', () => {
    const raw = encodeSummaryCursor(USER_A, {
      lastMessageAt: NOW,
      id: CONV_A,
    });
    expect(decodeSummaryCursor(raw, USER_B)).toBeNull();
  });

  it('rejects unknown version / invalid timestamp / invalid uuid', () => {
    expect(
      decodeSummaryCursor(b64({ v: 2, p: USER_A, t: NOW, id: CONV_A }), USER_A),
    ).toBeNull();
    expect(
      decodeSummaryCursor(
        b64({ v: 1, p: USER_A, t: 'nope', id: CONV_A }),
        USER_A,
      ),
    ).toBeNull();
    expect(
      decodeSummaryCursor(b64({ v: 1, p: USER_A, t: NOW, id: 'x' }), USER_A),
    ).toBeNull();
  });
});
