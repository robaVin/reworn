import type { SellerStatus } from '@prisma/client';

/**
 * Feature-gating — the SINGLE pure authority that turns a seller's entitlement
 * facts into concrete feature access. Consumers (listing publishing today;
 * storefront limits and other gated features later) call these instead of
 * re-deriving rules, so the policy can never diverge between call sites.
 *
 * Pure: no DB, no env, no request access. The DB-backed entitlement resolver
 * (`resolveSellerEntitlement`) assembles the inputs from real subscription state
 * and the server enforcement flag; nothing here trusts client state.
 */

/** The minimum facts needed to decide whether a seller may publish. */
export interface PublishGateInput {
  sellerStatus: SellerStatus;
  /** Server enforcement flag (env `SUBSCRIPTION_ENFORCEMENT`). */
  enforced: boolean;
  hasActiveSubscription: boolean;
}

export interface FeatureAccessInput extends PublishGateInput {
  /** Weekly listing quota from the active plan, or null when none applies. */
  weeklyListingQuota: number | null;
}

export interface FeatureAccess {
  canPublishListings: boolean;
  /** Effective weekly listing quota (0 when publishing is gated off). */
  weeklyListingQuota: number;
}

/**
 * Whether a seller may PUBLISH listings: an active seller, and — when
 * enforcement is on — a live subscription. When enforcement is off (the
 * documented dev bridge; forbidden in production), an active seller may publish
 * without a subscription.
 */
export function canPublish(input: PublishGateInput): boolean {
  return (
    input.sellerStatus === 'active' &&
    (!input.enforced || input.hasActiveSubscription)
  );
}

/** Resolve all gated features from entitlement facts. */
export function resolveFeatureAccess(input: FeatureAccessInput): FeatureAccess {
  const canPublishListings = canPublish(input);
  return {
    canPublishListings,
    // No live plan (or publishing gated off) => no quota.
    weeklyListingQuota: canPublishListings
      ? (input.weeklyListingQuota ?? 0)
      : 0,
  };
}

/** Named features that can be gated. Extend as gated features are added. */
export type Feature = 'publish_listing';

export function canUse(access: FeatureAccess, feature: Feature): boolean {
  switch (feature) {
    case 'publish_listing':
      return access.canPublishListings;
    default:
      return false;
  }
}
