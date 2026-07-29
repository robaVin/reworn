import { describe, it, expect } from 'vitest';
import type { SubscriptionStatus } from '@prisma/client';
import {
  applySubscriptionTransition,
  InvalidSubscriptionTransitionError,
  isEntitling,
  isLiveStatus,
  effectiveEnd,
  hasPeriodEnded,
  hasGraceEnded,
  type SubscriptionTransition,
} from '@/modules/subscription/subscription-status';

const sub = (
  status: SubscriptionStatus,
  currentPeriodEnd: Date | null = null,
  graceEndsAt: Date | null = null,
) => ({ status, currentPeriodEnd, graceEndsAt });

const NOW = new Date('2026-07-30T00:00:00.000Z');
const PAST = new Date('2026-07-01T00:00:00.000Z');
const FUTURE = new Date('2026-08-30T00:00:00.000Z');

describe('subscription state machine', () => {
  it('allows the legal transitions', () => {
    expect(applySubscriptionTransition('pending', 'activate')).toBe('active');
    expect(applySubscriptionTransition('active', 'enter_grace')).toBe(
      'grace_period',
    );
    expect(applySubscriptionTransition('grace_period', 'recover')).toBe(
      'active',
    );
    expect(applySubscriptionTransition('active', 'expire')).toBe('expired');
    expect(applySubscriptionTransition('grace_period', 'expire')).toBe(
      'expired',
    );
    expect(applySubscriptionTransition('active', 'cancel')).toBe('cancelled');
    expect(applySubscriptionTransition('pending', 'cancel')).toBe('cancelled');
    expect(applySubscriptionTransition('active', 'suspend')).toBe('suspended');
    expect(applySubscriptionTransition('suspended', 'reinstate')).toBe(
      'active',
    );
  });

  it('rejects illegal transitions', () => {
    const illegal: [SubscriptionStatus, SubscriptionTransition][] = [
      ['active', 'activate'],
      ['expired', 'recover'],
      ['cancelled', 'activate'],
      ['pending', 'enter_grace'],
      ['suspended', 'suspend'],
      ['expired', 'reinstate'],
    ];
    for (const [from, action] of illegal) {
      expect(() => applySubscriptionTransition(from, action)).toThrow(
        InvalidSubscriptionTransitionError,
      );
    }
  });
});

describe('entitlement predicates', () => {
  it('isLiveStatus is only active or grace_period', () => {
    expect(isLiveStatus('active')).toBe(true);
    expect(isLiveStatus('grace_period')).toBe(true);
    for (const s of [
      'pending',
      'expired',
      'cancelled',
      'suspended',
    ] as SubscriptionStatus[]) {
      expect(isLiveStatus(s)).toBe(false);
    }
  });

  it('effectiveEnd prefers grace end, then period end, then null', () => {
    expect(effectiveEnd(sub('active', PAST, FUTURE))!.getTime()).toBe(
      FUTURE.getTime(),
    );
    expect(effectiveEnd(sub('active', PAST, null))!.getTime()).toBe(
      PAST.getTime(),
    );
    expect(effectiveEnd(sub('active', null, null))).toBeNull();
  });

  it('isEntitling: live status AND within the grace-inclusive window', () => {
    expect(isEntitling(sub('active', FUTURE), NOW)).toBe(true);
    expect(isEntitling(sub('active', null), NOW)).toBe(true); // open-ended
    expect(isEntitling(sub('grace_period', PAST, FUTURE), NOW)).toBe(true);
    // Live status but the window (even grace) has elapsed -> not entitling.
    expect(isEntitling(sub('active', PAST), NOW)).toBe(false);
    expect(isEntitling(sub('grace_period', PAST, PAST), NOW)).toBe(false);
    // Non-live statuses never entitle.
    for (const s of [
      'pending',
      'expired',
      'cancelled',
      'suspended',
    ] as SubscriptionStatus[]) {
      expect(isEntitling(sub(s, FUTURE, FUTURE), NOW)).toBe(false);
    }
  });

  it('period/grace-ended predicates', () => {
    expect(hasPeriodEnded(sub('active', PAST), NOW)).toBe(true);
    expect(hasPeriodEnded(sub('active', FUTURE), NOW)).toBe(false);
    expect(hasGraceEnded(sub('grace_period', PAST, PAST), NOW)).toBe(true);
    expect(hasGraceEnded(sub('grace_period', PAST, FUTURE), NOW)).toBe(false);
  });
});
