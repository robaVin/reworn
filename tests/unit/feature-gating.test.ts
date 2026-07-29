import { describe, it, expect } from 'vitest';
import type { SellerStatus } from '@prisma/client';
import {
  canPublish,
  resolveFeatureAccess,
  canUse,
} from '@/modules/subscription/feature-gating';
import { canPublishListing } from '@/modules/catalog/entitlement';

describe('canPublish', () => {
  it('requires an active seller', () => {
    for (const s of ['frozen', 'banned'] as SellerStatus[]) {
      expect(
        canPublish({
          sellerStatus: s,
          enforced: false,
          hasActiveSubscription: true,
        }),
      ).toBe(false);
    }
  });

  it('when enforced, requires a live subscription', () => {
    expect(
      canPublish({
        sellerStatus: 'active',
        enforced: true,
        hasActiveSubscription: false,
      }),
    ).toBe(false);
    expect(
      canPublish({
        sellerStatus: 'active',
        enforced: true,
        hasActiveSubscription: true,
      }),
    ).toBe(true);
  });

  it('when NOT enforced (dev bridge), an active seller may publish without a sub', () => {
    expect(
      canPublish({
        sellerStatus: 'active',
        enforced: false,
        hasActiveSubscription: false,
      }),
    ).toBe(true);
  });
});

describe('resolveFeatureAccess', () => {
  it('grants the plan quota only when publishing is allowed', () => {
    expect(
      resolveFeatureAccess({
        sellerStatus: 'active',
        enforced: true,
        hasActiveSubscription: true,
        weeklyListingQuota: 15,
      }),
    ).toEqual({ canPublishListings: true, weeklyListingQuota: 15 });

    // Publishing gated off -> quota is 0 regardless of any plan number.
    expect(
      resolveFeatureAccess({
        sellerStatus: 'active',
        enforced: true,
        hasActiveSubscription: false,
        weeklyListingQuota: 15,
      }),
    ).toEqual({ canPublishListings: false, weeklyListingQuota: 0 });
  });

  it('canUse gates named features', () => {
    const yes = resolveFeatureAccess({
      sellerStatus: 'active',
      enforced: false,
      hasActiveSubscription: false,
      weeklyListingQuota: null,
    });
    expect(canUse(yes, 'publish_listing')).toBe(true);
  });
});

describe('catalog/subscription single-source parity', () => {
  it('catalog canPublishListing agrees with the subscription feature-gate across the input space', () => {
    for (const sellerStatus of [
      'active',
      'frozen',
      'banned',
    ] as SellerStatus[]) {
      for (const enforced of [true, false]) {
        for (const hasActiveSubscription of [true, false]) {
          expect(
            canPublishListing({
              sellerStatus,
              subscriptionEnforced: enforced,
              hasActiveSubscription,
            }),
          ).toBe(canPublish({ sellerStatus, enforced, hasActiveSubscription }));
        }
      }
    }
  });
});
