import { describe, it, expect } from 'vitest';
import {
  isSafeRedirectPath,
  safeRedirectPath,
  DEFAULT_SAFE_PATH,
} from '@/lib/safe-redirect';

describe('open-redirect prevention', () => {
  describe('accepts internal relative paths', () => {
    it.each(['/', '/account', '/seller/listings', '/a/b?x=1&y=2', '/a#frag'])(
      'allows %s',
      (p) => {
        expect(isSafeRedirectPath(p)).toBe(true);
      },
    );
  });

  describe('rejects external / malicious destinations', () => {
    it.each([
      'https://evil.example',
      'http://evil.example',
      '//evil.example', // protocol-relative
      '/\\evil.example', // backslash bypass
      'javascript:alert(1)',
      'data:text/html,x',
      'mailto:x@y.z',
      'evil.example/path', // no leading slash
      '', // empty
      '   ', // whitespace
      '/\n//evil', // control char smuggling
    ])('rejects %j', (p) => {
      expect(isSafeRedirectPath(p)).toBe(false);
    });

    it('rejects non-string input', () => {
      expect(isSafeRedirectPath(undefined)).toBe(false);
      expect(isSafeRedirectPath(null)).toBe(false);
      expect(isSafeRedirectPath(42)).toBe(false);
    });
  });

  describe('safeRedirectPath fallback', () => {
    it('returns the safe candidate unchanged', () => {
      expect(safeRedirectPath('/account')).toBe('/account');
    });
    it('falls back to default for unsafe input', () => {
      expect(safeRedirectPath('https://evil')).toBe(DEFAULT_SAFE_PATH);
    });
    it('honours a custom fallback', () => {
      expect(safeRedirectPath('//evil', '/home')).toBe('/home');
    });
  });
});
