import 'server-only';

import { env } from '@/lib/env';
import type { PaymentProvider } from './provider';
import { MockPaymentProvider } from './mock-provider';
import { PaymentConfigError } from './errors';

/**
 * Resolve the configured payment provider, or FAIL CLOSED. There is no silent
 * fallback: if payments are not configured (`PAYMENT_PROVIDER="none"`) checkout
 * is refused. `mock` is the only implemented provider today (Stripe/CaSys are
 * deferred; env validation forbids `mock` in production and hard-disables
 * `casys`). The provider validates its own configuration before use.
 */

let testOverride: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (testOverride) return testOverride;

  switch (env.PAYMENT_PROVIDER) {
    case 'mock': {
      const provider = new MockPaymentProvider();
      provider.validateConfiguration();
      return provider;
    }
    // 'none' (and any provider not wired up) -> payments unavailable.
    default:
      throw new PaymentConfigError('provider_unavailable');
  }
}

/** Test-only: inject a provider (e.g. a spy/failing stub). Pass null to reset. */
export function __setPaymentProviderForTests(
  provider: PaymentProvider | null,
): void {
  testOverride = provider;
}
