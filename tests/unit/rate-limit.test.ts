import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InMemoryRateLimitStore,
  checkRateLimit,
  clientIdentity,
  rateLimitKey,
} from '@/lib/security/rate-limit';

describe('rate limiting', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit', () => {
    for (let i = 0; i < 3; i++) {
      expect(store.check('k', 3, 1000).allowed).toBe(true);
    }
  });

  it('blocks the request that exceeds the limit', () => {
    for (let i = 0; i < 3; i++) store.check('k', 3, 1000);
    const r = store.check('k', 3, 1000);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('reports remaining budget accurately', () => {
    expect(store.check('k', 3, 1000).remaining).toBe(2);
    expect(store.check('k', 3, 1000).remaining).toBe(1);
    expect(store.check('k', 3, 1000).remaining).toBe(0);
  });

  it('isolates separate keys', () => {
    for (let i = 0; i < 3; i++) store.check('a', 3, 1000);
    expect(store.check('a', 3, 1000).allowed).toBe(false);
    // A different identity must be unaffected.
    expect(store.check('b', 3, 1000).allowed).toBe(true);
  });

  it('recovers once the window slides past', () => {
    for (let i = 0; i < 3; i++) store.check('k', 3, 1000);
    expect(store.check('k', 3, 1000).allowed).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(store.check('k', 3, 1000).allowed).toBe(true);
  });

  it('slides rather than resetting in fixed buckets', () => {
    // Two hits at t=0, one at t=600.
    store.check('k', 3, 1000);
    store.check('k', 3, 1000);
    vi.advanceTimersByTime(600);
    store.check('k', 3, 1000);
    expect(store.check('k', 3, 1000).allowed).toBe(false);

    // At t=1001 the first two have aged out, so budget partially returns.
    vi.advanceTimersByTime(401);
    expect(store.check('k', 3, 1000).allowed).toBe(true);
  });

  it('exposes a reset time in the future when blocked', () => {
    for (let i = 0; i < 2; i++) store.check('k', 2, 1000);
    const r = store.check('k', 2, 1000);
    expect(r.allowed).toBe(false);
    expect(r.resetAt).toBeGreaterThan(Date.now());
  });

  it('checkRateLimit accepts an injected store', () => {
    const r = checkRateLimit('scope', 'id', 1, 60, store);
    expect(r.allowed).toBe(true);
    expect(checkRateLimit('scope', 'id', 1, 60, store).allowed).toBe(false);
  });
});

describe('client identity', () => {
  it('uses the left-most x-forwarded-for entry (the real client)', () => {
    const h = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(clientIdentity(h)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIdentity(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe(
      '9.9.9.9',
    );
  });

  it('returns a stable placeholder when nothing is available', () => {
    expect(clientIdentity(new Headers())).toBe('unknown');
  });
});

describe('rateLimitKey', () => {
  it('namespaces by scope so endpoints do not share budgets', () => {
    expect(rateLimitKey('/api/auth', '1.2.3.4')).toBe('/api/auth:1.2.3.4');
    expect(rateLimitKey('/api/auth', '1.2.3.4')).not.toBe(
      rateLimitKey('/api/payments', '1.2.3.4'),
    );
  });
});
