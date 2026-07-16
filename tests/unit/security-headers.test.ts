import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildContentSecurityPolicy,
  securityHeaders,
  generateNonce,
} from '@/lib/security/headers';

const ORIGINAL = { ...process.env };

function parseCsp(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(';').map((d) => {
      const [name = '', ...sources] = d.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe('Content-Security-Policy', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abc123.supabase.co';
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('locks down the dangerous directives', () => {
    const csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['default-src']).toEqual(["'self'"]);
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['form-action']).toEqual(["'self'"]);
  });

  it('contains NO wildcard sources anywhere', () => {
    const csp = buildContentSecurityPolicy('n0nce');
    expect(csp).not.toContain('*');
  });

  it('allows Supabase for API calls and Realtime websockets', () => {
    const csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['connect-src']).toContain('https://abc123.supabase.co');
    expect(csp['connect-src']).toContain('wss://abc123.supabase.co');
  });

  it('allows Supabase Storage as an image source', () => {
    const csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['img-src']).toContain('https://abc123.supabase.co');
  });

  it('allows the Sentry origin only when a DSN is configured', () => {
    let csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['connect-src']).not.toContain('https://o1.ingest.sentry.io');

    process.env.NEXT_PUBLIC_SENTRY_DSN =
      'https://publickey@o1.ingest.sentry.io/123';
    csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['connect-src']).toContain('https://o1.ingest.sentry.io');
  });

  it('does not allow any Google origin (OAuth is a full-page redirect)', () => {
    const csp = buildContentSecurityPolicy('n0nce');
    expect(csp).not.toContain('google.com');
    expect(csp).not.toContain('gstatic.com');
  });

  it('self-hosts fonts (next/font) so no third-party font origin is needed', () => {
    const csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['font-src']).toEqual(["'self'"]);
  });

  it('permits blob workers so the PWA service worker can register', () => {
    const csp = parseCsp(buildContentSecurityPolicy('n0nce'));
    expect(csp['worker-src']).toContain('blob:');
  });

  it('tolerates a malformed Supabase URL without emitting a broken source', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url';
    const csp = buildContentSecurityPolicy('n0nce');
    expect(csp).not.toContain('null');
    expect(csp).not.toContain('undefined');
  });
});

describe('security headers', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it('sets the baseline defensive headers', () => {
    const h = securityHeaders('n0nce');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  it('omits HSTS outside production (would poison localhost)', () => {
    const h = securityHeaders('n0nce');
    expect(h['Strict-Transport-Security']).toBeUndefined();
  });
});

describe('nonce generation', () => {
  it('produces a fresh, non-trivial nonce each call', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });
});
