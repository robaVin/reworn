import 'server-only';

import { logger } from '@/lib/logger';
import { AuthorizationError } from '@/modules/auth/errors';
import {
  enforceActionRateLimit,
  RateLimitedError,
} from '@/lib/security/rate-limit';
import { initiateCheckout } from './checkout-service';
import {
  CheckoutRejectedError,
  PaymentConfigError,
  PaymentProviderError,
} from './errors';
import type { PaymentProvider } from './provider';
import type { CheckoutErrorKind } from './checkout-state';

/**
 * Server-only checkout core, separate from the `'use server'` action so it is
 * directly testable (pass a userId + an injected provider; no request context,
 * no `redirect()` side effect). The action owns auth + redirect; this maps a
 * request to a redirect target or a SAFE failure kind — raw provider errors,
 * config detail, and ids never surface.
 */

export type CheckoutOutcome =
  | { kind: 'redirect'; to: string }
  | { kind: 'error'; error: CheckoutErrorKind };

/** Maps a thrown domain error to a safe, detail-free checkout-failure kind. */
export function mapCheckoutError(error: unknown): CheckoutErrorKind {
  if (error instanceof RateLimitedError) return 'rateLimited';
  if (error instanceof AuthorizationError) {
    if (error.reason === 'seller_profile_required') return 'notSeller';
    return 'sellerInactive'; // seller_frozen / seller_banned
  }
  if (error instanceof CheckoutRejectedError) return 'invalidPlan';
  if (error instanceof PaymentConfigError) return 'providerUnavailable';
  if (error instanceof PaymentProviderError) return 'providerError';
  // Unexpected: log server-side (redaction strips secrets) and surface a generic
  // kind. The raw provider error / SQL / ids never reach the caller.
  logger.error('checkout initiation failed', { error });
  return 'unexpected';
}

/**
 * Resolve a checkout initiation. Returns the provider checkout URL to redirect
 * to, or a safe failure kind. Never performs the redirect (the action does).
 */
export async function resolveCheckout(
  userId: string,
  planIdRaw: unknown,
  provider?: PaymentProvider,
): Promise<CheckoutOutcome> {
  if (typeof planIdRaw !== 'string' || planIdRaw.length === 0) {
    return { kind: 'error', error: 'invalidPlan' };
  }
  try {
    // Throttle per verified seller before contacting the provider.
    enforceActionRateLimit('checkout', userId);
    const { checkoutUrl } = await initiateCheckout(userId, planIdRaw, provider);
    return { kind: 'redirect', to: checkoutUrl };
  } catch (error) {
    return { kind: 'error', error: mapCheckoutError(error) };
  }
}
