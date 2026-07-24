import { describe, it, expect } from 'vitest';
import {
  assertCanCreateListing,
  assertCanPublishListing,
  canPublishListing,
  type ListingEntitlementInput,
} from '@/modules/catalog/entitlement';
import { AuthorizationError } from '@/modules/auth/errors';

const base: ListingEntitlementInput = {
  sellerStatus: 'active',
  subscriptionEnforced: false,
  hasActiveSubscription: false,
};

describe('listing entitlement (pure, server-authoritative)', () => {
  describe('draft creation', () => {
    it('allows an active seller', () => {
      expect(() =>
        assertCanCreateListing({ sellerStatus: 'active' }),
      ).not.toThrow();
    });
    it.each(['frozen', 'banned'] as const)('blocks a %s seller', (status) => {
      expect(() => assertCanCreateListing({ sellerStatus: status })).toThrow(
        AuthorizationError,
      );
    });
  });

  describe('publishing — development bridge (enforcement OFF)', () => {
    it('allows an active seller WITHOUT a subscription', () => {
      expect(() =>
        assertCanPublishListing({ ...base, subscriptionEnforced: false }),
      ).not.toThrow();
      expect(canPublishListing({ ...base, subscriptionEnforced: false })).toBe(
        true,
      );
    });

    it('still blocks a non-active seller', () => {
      expect(() =>
        assertCanPublishListing({
          ...base,
          sellerStatus: 'frozen',
          subscriptionEnforced: false,
        }),
      ).toThrow(AuthorizationError);
    });
  });

  describe('publishing — enforcement ON (production behaviour)', () => {
    it('DENIES an active seller with no subscription (subscription_required)', () => {
      const input = {
        ...base,
        subscriptionEnforced: true,
        hasActiveSubscription: false,
      };
      expect(() => assertCanPublishListing(input)).toThrow(AuthorizationError);
      expect(() => assertCanPublishListing(input)).toThrow(
        /subscription_required/,
      );
      expect(canPublishListing(input)).toBe(false);
    });

    it('allows an active seller WITH a subscription (future path)', () => {
      const input = {
        ...base,
        subscriptionEnforced: true,
        hasActiveSubscription: true,
      };
      expect(() => assertCanPublishListing(input)).not.toThrow();
      expect(canPublishListing(input)).toBe(true);
    });
  });

  it('toggling enforcement flips a title-complete active seller between allow/deny', () => {
    expect(canPublishListing({ ...base, subscriptionEnforced: false })).toBe(
      true,
    );
    expect(canPublishListing({ ...base, subscriptionEnforced: true })).toBe(
      false,
    );
  });
});
