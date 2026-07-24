import 'server-only';

import { AuthorizationError } from '@/modules/auth/errors';
import type { SellerStatus } from '@prisma/client';

/**
 * Listing entitlement — the SINGLE server-side authority for whether a seller
 * may create/publish listings. Every listing mutation routes through here; there
 * is no browser-only entitlement check.
 *
 * Current rules (for the system as it exists today):
 *   • The seller profile must be `active` (not `frozen` or `banned`).
 *
 * Deliberately NOT yet enforced (the subscription domain does not exist until
 * Increment 7): active-subscription and weekly-listing-quota checks. This module
 * is the exact, documented place those checks are ADDED — they are not enforced
 * elsewhere, and nothing here fabricates a subscription. Until Increment 7, an
 * `active` seller may publish; after it, publishing additionally requires an
 * active subscription and remaining quota.
 */

export interface SellerEntitlementView {
  status: SellerStatus;
}

export function assertSellerActive(seller: SellerEntitlementView): void {
  if (seller.status !== 'active') {
    throw new AuthorizationError(403, `seller_${seller.status}`);
  }
}

/** May the seller create a draft listing? */
export function assertCanCreateListing(seller: SellerEntitlementView): void {
  assertSellerActive(seller);
}

/** May the seller publish a listing? (Subscription + quota join here at #7.) */
export function assertCanPublishListing(seller: SellerEntitlementView): void {
  assertSellerActive(seller);
  // Increment 7 inserts here:
  //   assertActiveSubscription(seller);
  //   assertWeeklyQuotaRemaining(seller);
}
