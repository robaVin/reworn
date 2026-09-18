import { describe, it, expect, beforeEach } from 'vitest';
import {
  ACTION_LIMITS,
  RateLimitedError,
  enforceActionRateLimit,
  InMemoryRateLimitStore,
  rateLimitStore,
} from '@/lib/security/rate-limit';
import {
  mapConversationError,
  mapSendError,
  resolveStartConversation,
  resolveSendMessage,
} from '@/modules/messaging/conversation-actions';
import {
  mapCheckoutError,
  resolveCheckout,
} from '@/modules/payment/checkout-actions';

/**
 * SA-1 — per-user Server Action rate limiting.
 *
 * These tests prove that the authenticated write boundaries (message send,
 * conversation start, checkout initiation) THROTTLE scripted abuse per verified
 * user id, and that the throttle SHORT-CIRCUITS before the service/DB is ever
 * touched (so an attacker cannot spend DB work past the limit). The keying is
 * always the verified user id — never a client-supplied value.
 */

const LISTING = '11111111-1111-1111-1111-111111111111';
const CONVO = '22222222-2222-2222-2222-222222222222';

/** Exhaust the singleton budget for an action+identity (used by resolve*). */
function exhaust(action: keyof typeof ACTION_LIMITS, identity: string): void {
  const { max } = ACTION_LIMITS[action];
  for (let i = 0; i < max; i++) enforceActionRateLimit(action, identity);
}

describe('enforceActionRateLimit', () => {
  let store: InMemoryRateLimitStore;
  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  it('allows exactly up to the configured max, then throws', () => {
    const { max } = ACTION_LIMITS.messageSend;
    for (let i = 0; i < max; i++) {
      expect(() =>
        enforceActionRateLimit('messageSend', 'user-a', store),
      ).not.toThrow();
    }
    expect(() =>
      enforceActionRateLimit('messageSend', 'user-a', store),
    ).toThrow(RateLimitedError);
  });

  it('throws a safe 429 carrying the action name and a future reset', () => {
    const { max } = ACTION_LIMITS.checkout;
    for (let i = 0; i < max; i++) {
      enforceActionRateLimit('checkout', 'seller-1', store);
    }
    try {
      enforceActionRateLimit('checkout', 'seller-1', store);
      throw new Error('expected RateLimitedError');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitedError);
      const e = err as RateLimitedError;
      expect(e.status).toBe(429);
      expect(e.action).toBe('checkout');
      expect(e.resetAt).toBeGreaterThan(Date.now());
      // The message must not leak an identity.
      expect(e.message).not.toContain('seller-1');
    }
  });

  it('isolates budgets per verified identity', () => {
    const { max } = ACTION_LIMITS.messageSend;
    for (let i = 0; i < max; i++) {
      enforceActionRateLimit('messageSend', 'user-a', store);
    }
    expect(() =>
      enforceActionRateLimit('messageSend', 'user-a', store),
    ).toThrow(RateLimitedError);
    // A different user is unaffected.
    expect(() =>
      enforceActionRateLimit('messageSend', 'user-b', store),
    ).not.toThrow();
  });

  it('isolates budgets per action (separate scopes)', () => {
    const { max } = ACTION_LIMITS.messageSend;
    for (let i = 0; i < max; i++) {
      enforceActionRateLimit('messageSend', 'user-a', store);
    }
    expect(() =>
      enforceActionRateLimit('messageSend', 'user-a', store),
    ).toThrow(RateLimitedError);
    // Same identity, different action: independent budget.
    expect(() =>
      enforceActionRateLimit('conversationStart', 'user-a', store),
    ).not.toThrow();
  });
});

describe('error mapping → rateLimited', () => {
  const err = new RateLimitedError('messageSend', Date.now() + 1000);

  it('mapSendError maps a RateLimitedError to the safe rateLimited kind', () => {
    expect(mapSendError(err)).toBe('rateLimited');
  });

  it('mapConversationError maps a RateLimitedError to rateLimited', () => {
    expect(mapConversationError(err)).toBe('rateLimited');
  });

  it('mapCheckoutError maps a RateLimitedError to rateLimited', () => {
    expect(mapCheckoutError(err)).toBe('rateLimited');
  });
});

describe('resolve* throttle abuse before the service/DB (singleton store)', () => {
  // These use the real singleton store the actions use in production. Each test
  // uses a UNIQUE identity so the shared store cannot leak budget across tests,
  // and resets the singleton for hygiene.
  beforeEach(() => {
    rateLimitStore.reset();
  });

  it('resolveSendMessage returns rateLimited once the sender budget is spent', async () => {
    const userId = 'send-abuser';
    exhaust('messageSend', userId);
    // No DB is required: the throttle fires before sendConversationMessage. A
    // non-throttled call here would hit the service and fail differently.
    const out = await resolveSendMessage(userId, CONVO, 'hello', undefined);
    expect(out).toEqual({ kind: 'error', error: 'rateLimited' });
  });

  it('resolveStartConversation returns rateLimited once the user budget is spent', async () => {
    const userId = 'convo-abuser';
    exhaust('conversationStart', userId);
    const out = await resolveStartConversation(userId, LISTING);
    expect(out).toEqual({ kind: 'error', error: 'rateLimited' });
  });

  it('resolveCheckout returns rateLimited once the seller budget is spent', async () => {
    const userId = 'checkout-abuser';
    exhaust('checkout', userId);
    const out = await resolveCheckout(userId, 'plan_monthly');
    expect(out).toEqual({ kind: 'error', error: 'rateLimited' });
  });

  it('a fresh identity is not throttled by another user’s abuse', async () => {
    exhaust('conversationStart', 'noisy-neighbour');
    // Different user, empty listing id → validationError (reached the body,
    // proving the limiter did not block this identity).
    const out = await resolveStartConversation('quiet-user', '');
    expect(out).toEqual({ kind: 'error', error: 'validationError' });
  });
});
