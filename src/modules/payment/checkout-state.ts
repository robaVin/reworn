/**
 * Pure, client-safe types + copy for checkout initiation. NO server-only
 * imports. User-facing copy is generic and never leaks provider internals.
 */

export type CheckoutErrorKind =
  | 'notSeller'
  | 'sellerInactive'
  | 'invalidPlan'
  | 'rateLimited'
  | 'providerUnavailable'
  | 'providerError'
  | 'unexpected';

/** useActionState state for a future checkout button. Success is a redirect. */
export type CheckoutState =
  { status: 'idle' } | { status: 'error'; error: CheckoutErrorKind };

export const INITIAL_CHECKOUT_STATE: CheckoutState = { status: 'idle' };

/** Safe, generic message for a checkout failure — no provider detail. */
export function checkoutErrorMessage(kind: CheckoutErrorKind): string {
  switch (kind) {
    case 'notSeller':
      return 'Only sellers can start a subscription.';
    case 'sellerInactive':
      return 'Your seller account can’t start a subscription right now.';
    case 'invalidPlan':
      return 'That plan isn’t available.';
    case 'rateLimited':
      return 'You are doing that too quickly. Please wait a moment and try again.';
    case 'providerUnavailable':
      return 'Payments aren’t available yet. Please try again later.';
    case 'providerError':
    case 'unexpected':
    default:
      return 'Something went wrong starting checkout. Please try again.';
  }
}
