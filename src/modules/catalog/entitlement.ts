import { AuthorizationError } from '@/modules/auth/errors';
import type { SellerStatus } from '@prisma/client';
import { canPublish } from '@/modules/subscription/feature-gating';

/**
 * Listing entitlement — the SINGLE server-side authority for whether a seller
 * may create or publish listings.
 *
 * PURE by design (no env, no DB, no request access): callers assemble an
 * explicit `ListingEntitlementInput` from server-side facts (the seller's
 * status, whether subscription enforcement is on, whether they hold an active
 * subscription) and pass it in. There is NO path through which browser state,
 * a query string, or a cookie can influence the decision.
 *
 * Modes:
 *  - `subscriptionEnforced = true` (production default): publishing requires an
 *    active subscription. The bank gateway is not connected yet, so no one has a
 *    subscription and publishing is refused with `subscription_required` — the
 *    UI shows a truthful "payment setup unavailable" state.
 *  - `subscriptionEnforced = false` (development bridge only): an active seller
 *    may publish without a subscription, so the workflow is testable now. This
 *    mode is refused in production by environment validation.
 *
 * Increment 7 replaces the source of `hasActiveSubscription` with the real
 * subscription service WITHOUT changing listing-service APIs or this contract.
 */

export interface ListingEntitlementInput {
  sellerStatus: SellerStatus;
  subscriptionEnforced: boolean;
  hasActiveSubscription: boolean;
}

export function assertSellerActive(status: SellerStatus): void {
  if (status !== 'active') {
    throw new AuthorizationError(403, `seller_${status}`);
  }
}

/** Draft creation only needs an active seller (drafts never require payment). */
export function assertCanCreateListing(
  input: Pick<ListingEntitlementInput, 'sellerStatus'>,
): void {
  assertSellerActive(input.sellerStatus);
}

/** Publishing needs an active seller AND, when enforced, a live subscription. */
export function assertCanPublishListing(input: ListingEntitlementInput): void {
  assertSellerActive(input.sellerStatus);
  if (input.subscriptionEnforced && !input.hasActiveSubscription) {
    throw new AuthorizationError(403, 'subscription_required');
  }
}

/**
 * Non-throwing publish predicate for UI/routing. Delegates to the subscription
 * domain's feature-gate (the single source of the rule) so listing and
 * subscription code can never diverge on what "may publish" means.
 */
export function canPublishListing(input: ListingEntitlementInput): boolean {
  return canPublish({
    sellerStatus: input.sellerStatus,
    enforced: input.subscriptionEnforced,
    hasActiveSubscription: input.hasActiveSubscription,
  });
}
