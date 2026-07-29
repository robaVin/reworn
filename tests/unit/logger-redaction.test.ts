import { describe, it, expect } from 'vitest';
import { redact, maskValue, REDACTED } from '@/lib/logger';

/**
 * Redaction is a security control, not a formatting nicety. If it regresses,
 * secrets leak into log aggregators. Every category named in the Stage 1
 * security requirements is asserted here.
 */
describe('logger redaction', () => {
  describe('required redaction categories', () => {
    it.each([
      ['access tokens', { access_token: 'abc123' }],
      ['accessToken (camelCase)', { accessToken: 'abc123' }],
      ['refresh tokens', { refresh_token: 'r-abc' }],
      ['refreshToken (camelCase)', { refreshToken: 'r-abc' }],
      ['cookies', { cookie: 'sb-access-token=xyz' }],
      ['set-cookie', { 'set-cookie': 'session=xyz' }],
      ['passwords', { password: 'hunter2' }],
      ['OTP values', { otp: '123456' }],
      ['authorization headers', { authorization: 'Bearer xyz' }],
      ['Authorization (capitalised)', { Authorization: 'Bearer xyz' }],
      ['payment signatures', { signature: 'deadbeef' }],
      ['checksums', { checksum: 'deadbeef' }],
      ['provider secrets', { merchant_password: 's3cr3t' }],
      ['service role keys', { SUPABASE_SERVICE_ROLE_KEY: 'k' }],
      ['card numbers', { card: '4111111111111111' }],
      ['CVV', { cvv: '123' }],
    ])('redacts %s', (_label, input) => {
      const out = redact(input) as Record<string, unknown>;
      const value = Object.values(out)[0];
      expect(value).toBe(REDACTED);
    });
  });

  describe('deny-list is substring-based (documents known false positives)', () => {
    // The deny-list matches key SUBSTRINGS, so `span` matches `pan` (card PAN)
    // and would be masked. `src/lib/perf.ts` therefore emits the span name under
    // the key `op`, which is NOT a denylisted substring and must survive — else
    // PERF_TRACE output is useless for identifying which operation ran.
    it('masks a `span` key (contains `pan`) — the reason perf uses `op`', () => {
      const out = redact({ span: 'db.sellerResolve' }) as { span: string };
      expect(out.span).toBe(REDACTED);
    });

    it('keeps the perf `op` key so timing spans stay identifiable', () => {
      const out = redact({ op: 'db.sellerResolve', ms: 12, count: 1 }) as {
        op: string;
        ms: number;
        count: number;
      };
      expect(out.op).toBe('db.sellerResolve');
      expect(out.ms).toBe(12);
      expect(out.count).toBe(1);
    });
  });

  it('masks PII rather than dropping it (email)', () => {
    const out = redact({ email: 'nikola@example.com' }) as { email: string };
    expect(out.email).not.toContain('nikola');
    expect(out.email).toContain('@example.com');
    expect(out.email.startsWith('n')).toBe(true);
  });

  it('masks phone numbers', () => {
    const out = redact({ phone: '+38970123456' }) as { phone: string };
    expect(out.phone).not.toBe('+38970123456');
    expect(out.phone).toContain('*');
  });

  it('redacts nested secrets', () => {
    const out = redact({
      user: { id: 'u1', profile: { password: 'p', name: 'Ana' } },
    }) as { user: { id: string; profile: { password: string; name: string } } };

    expect(out.user.profile.password).toBe(REDACTED);
    // Non-sensitive data must survive, or logs become useless.
    expect(out.user.id).toBe('u1');
    expect(out.user.profile.name).toBe('Ana');
  });

  it('redacts secrets inside arrays', () => {
    const out = redact([{ token: 'a' }, { safe: 'b' }]) as Array<
      Record<string, unknown>
    >;
    expect(out[0]?.token).toBe(REDACTED);
    expect(out[1]?.safe).toBe('b');
  });

  it('scrubs a JWT embedded in a free-text string', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = redact({ note: `failed with ${jwt} today` }) as {
      note: string;
    };
    expect(out.note).not.toContain('eyJ');
    expect(out.note).toContain(REDACTED);
  });

  it('scrubs a Bearer token embedded in a string', () => {
    const out = redact({ note: 'sent Bearer abc.def-ghi to api' }) as {
      note: string;
    };
    expect(out.note).not.toContain('abc.def-ghi');
    expect(out.note).toContain(REDACTED);
  });

  it('scrubs tokens hidden in an Error stack', () => {
    const err = new Error('boom Bearer secret123');
    const out = redact(err) as { message: string };
    expect(out.message).not.toContain('secret123');
  });

  it('redacts values in Map-like carriers (e.g. Headers)', () => {
    const map = new Map<string, string>([
      ['authorization', 'Bearer x'],
      ['x-request-id', 'req-1'],
    ]);
    const out = redact(map) as Record<string, unknown>;
    expect(out.authorization).toBe(REDACTED);
    expect(out['x-request-id']).toBe('req-1');
  });

  describe('robustness', () => {
    it('does not crash on circular references', () => {
      const a: Record<string, unknown> = { name: 'a' };
      a.self = a;
      expect(() => redact(a)).not.toThrow();
      expect((redact(a) as { self: string }).self).toBe('[Circular]');
    });

    it('bounds recursion depth', () => {
      let deep: Record<string, unknown> = { end: true };
      for (let i = 0; i < 20; i++) deep = { nested: deep };
      expect(() => redact(deep)).not.toThrow();
      expect(JSON.stringify(redact(deep))).toContain('[MaxDepth]');
    });

    it('truncates very long strings', () => {
      const out = redact({ blob: 'x'.repeat(5000) }) as { blob: string };
      expect(out.blob.length).toBeLessThan(5000);
      expect(out.blob).toContain('[truncated]');
    });

    it('passes through primitives untouched', () => {
      expect(redact(null)).toBeNull();
      expect(redact(42)).toBe(42);
      expect(redact(true)).toBe(true);
    });
  });

  describe('maskValue', () => {
    it('masks short values entirely', () => {
      expect(maskValue('abc')).toBe('***');
    });
    it('keeps a readable head and tail for long values', () => {
      const masked = maskValue('+38970123456');
      expect(masked.startsWith('+38')).toBe(true);
      expect(masked.endsWith('56')).toBe(true);
    });
  });
});
