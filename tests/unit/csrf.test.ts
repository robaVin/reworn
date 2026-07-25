import { describe, it, expect } from 'vitest';
import { verifyCsrf, isExemptFromCsrf } from '@/lib/security/csrf';

const APP = 'https://reworn.mk';
const EVIL = 'https://evil.example';

describe('CSRF origin verification', () => {
  describe('safe methods', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s without an origin', (m) => {
      expect(verifyCsrf(m, '/api/x', null, null, APP).ok).toBe(true);
    });
  });

  describe('state-changing methods', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'allows %s from the app origin',
      (m) => {
        expect(verifyCsrf(m, '/api/x', APP, null, APP).ok).toBe(true);
      },
    );

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
      'rejects %s from a foreign origin',
      (m) => {
        const r = verifyCsrf(m, '/api/x', EVIL, null, APP);
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('origin_mismatch');
      },
    );

    it('rejects when both Origin and Referer are absent', () => {
      const r = verifyCsrf('POST', '/api/x', null, null, APP);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('missing_origin_and_referer');
    });

    it('falls back to Referer when Origin is absent', () => {
      expect(
        verifyCsrf('POST', '/api/x', null, `${APP}/some/page`, APP).ok,
      ).toBe(true);
    });

    it('rejects a foreign Referer', () => {
      const r = verifyCsrf('POST', '/api/x', null, `${EVIL}/page`, APP);
      expect(r.ok).toBe(false);
    });

    it('is not fooled by an origin that merely starts with the app origin', () => {
      const r = verifyCsrf('POST', '/api/x', `${APP}.evil.example`, null, APP);
      expect(r.ok).toBe(false);
    });

    it('ignores a malformed Referer rather than trusting it', () => {
      const r = verifyCsrf('POST', '/api/x', null, 'not-a-url', APP);
      expect(r.ok).toBe(false);
    });

    it('treats lower-case methods identically', () => {
      expect(verifyCsrf('post', '/api/x', EVIL, null, APP).ok).toBe(false);
      expect(verifyCsrf('get', '/api/x', EVIL, null, APP).ok).toBe(true);
    });
  });

  describe('image upload route', () => {
    const UPLOAD = '/api/seller/listings/1b2c/images';

    it('is NOT exempt from origin checking', () => {
      expect(isExemptFromCsrf(UPLOAD)).toBe(false);
    });

    it('rejects a cross-origin upload POST', () => {
      const r = verifyCsrf('POST', UPLOAD, EVIL, null, APP);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('origin_mismatch');
    });

    it('rejects an upload POST with no Origin/Referer', () => {
      expect(verifyCsrf('POST', UPLOAD, null, null, APP).ok).toBe(false);
    });

    it('allows a same-origin upload POST', () => {
      expect(verifyCsrf('POST', UPLOAD, APP, null, APP).ok).toBe(true);
    });
  });
});
