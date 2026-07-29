import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '@/modules/catalog/cursor';

const base = {
  v: 1 as const,
  sort: 'newest' as const,
  sortValue: '2026-01-01T00:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000001',
  fp: 'abc123',
};

describe('cursor codec', () => {
  it('round-trips a valid cursor', () => {
    const token = encodeCursor(base);
    expect(decodeCursor(token, { sort: 'newest', fp: 'abc123' })).toEqual(base);
  });

  it('is opaque base64url (no raw JSON leaking)', () => {
    const token = encodeCursor(base);
    expect(token).not.toContain('{');
    expect(token).not.toContain('newest');
  });

  it('rejects a cursor minted for a different sort', () => {
    const token = encodeCursor(base);
    expect(decodeCursor(token, { sort: 'price_asc', fp: 'abc123' })).toBeNull();
  });

  it('rejects a cursor whose filter fingerprint changed', () => {
    const token = encodeCursor(base);
    expect(decodeCursor(token, { sort: 'newest', fp: 'DIFFERENT' })).toBeNull();
  });

  it('rejects malformed / empty / wrong-version tokens', () => {
    expect(
      decodeCursor(undefined, { sort: 'newest', fp: 'abc123' }),
    ).toBeNull();
    expect(
      decodeCursor('!!!not base64!!!', { sort: 'newest', fp: 'abc123' }),
    ).toBeNull();
    const wrongV = Buffer.from(JSON.stringify({ ...base, v: 9 })).toString(
      'base64url',
    );
    expect(decodeCursor(wrongV, { sort: 'newest', fp: 'abc123' })).toBeNull();
  });

  it('rejects a tampered non-uuid id', () => {
    const bad = Buffer.from(
      JSON.stringify({ ...base, id: 'not-a-uuid' }),
    ).toString('base64url');
    expect(decodeCursor(bad, { sort: 'newest', fp: 'abc123' })).toBeNull();
  });
});
