import type { SubscriptionStatus } from '@prisma/client';

/**
 * Subscription DTOs — the ONLY subscription shapes that leave the module.
 *
 * Privacy contract (asserted by tests): these expose only what a seller needs to
 * see about their OWN subscription and entitlement. They never carry seller
 * internal ids, subscription/plan row ids, payment-attempt ids, merchant/provider
 * references, immutable-event snapshots, or any other financial internals.
 */

/** A plan as surfaced to the seller — code/name + the quota it grants. */
export interface SubscriptionPlanSummary {
  code: string;
  name: string;
  weeklyListingQuota: number;
}

/** The seller's view of their own subscription. */
export interface SellerSubscriptionDTO {
  status: SubscriptionStatus;
  plan: SubscriptionPlanSummary;
  currentPeriodEnd: Date | null;
  /** Set when a cancellation is scheduled to take effect at period end. */
  cancelAt: Date | null;
  isTrial: boolean;
}

/**
 * Resolved seller entitlement — the single source of truth consumed by
 * publishing limits and seller authorization. Contains no ids or financials.
 */
export interface SellerEntitlement {
  /** Server enforcement flag (env `SUBSCRIPTION_ENFORCEMENT`). */
  enforced: boolean;
  /** A live subscription is present AND still within its (grace-inclusive) window. */
  hasActiveSubscription: boolean;
  /** The current live subscription's status, or null when none is live. */
  status: SubscriptionStatus | null;
  /** The active plan when entitled, else null. */
  plan: SubscriptionPlanSummary | null;
  currentPeriodEnd: Date | null;
  canPublishListings: boolean;
  weeklyListingQuota: number;
}
