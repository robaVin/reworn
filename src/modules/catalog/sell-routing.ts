/**
 * Pure decision for the `/sell` entry page. Kept framework-free so the routing
 * outcomes are unit-tested directly, and so the page component can compute its
 * inputs (roles ∥ seller-access) concurrently and then decide.
 *
 * Precondition: the caller has already confirmed an authenticated user; the
 * signed-out → /login redirect happens before this runs.
 */

export type SellDestination =
  | 'buyer_onboarding' // authenticated, but not a seller
  | 'profile_required' // seller role, no seller profile yet
  | 'seller_not_active' // seller profile exists but is not active
  | 'subscription_required' // active seller, but not entitled to publish
  | 'create'; // entitled → go create a listing

export function resolveSellDestination(input: {
  canActAsSeller: boolean;
  seller: { status: string } | null;
  canPublish: boolean;
}): SellDestination {
  if (!input.canActAsSeller) return 'buyer_onboarding';
  if (!input.seller) return 'profile_required';
  if (input.seller.status !== 'active') return 'seller_not_active';
  if (!input.canPublish) return 'subscription_required';
  return 'create';
}
