import { describe, it, expect } from 'vitest';
import { MockPaymentProvider } from '@/modules/payment/mock-provider';
import { getPaymentProvider } from '@/modules/payment/provider-factory';
import { mapCheckoutError } from '@/modules/payment/checkout-actions';
import {
  checkoutErrorMessage,
  type CheckoutErrorKind,
} from '@/modules/payment/checkout-state';
import { startCheckoutAction } from '@/modules/payment/actions';
import { AuthorizationError } from '@/modules/auth/errors';
import {
  CheckoutRejectedError,
  PaymentConfigError,
  PaymentProviderError,
} from '@/modules/payment/errors';

describe('MockPaymentProvider', () => {
  it('creates a deterministic, clearly-fake session from the merchant reference', async () => {
    const p = new MockPaymentProvider();
    const s = await p.createCheckoutSession({
      merchantReference: 'chk_abc',
      sellerId: 's',
      planCode: 'starter',
      planName: 'Starter',
      amountMinor: 30000,
      currency: 'MKD',
      successUrl: 'https://x/ok',
      cancelUrl: 'https://x/no',
      expiresAt: new Date(),
    });
    expect(s.providerSessionId).toBe('cs_mock_chk_abc');
    expect(s.checkoutUrl).toContain('cs_mock_chk_abc');
    expect(s.checkoutUrl).toContain('mock-payments'); // not a real gateway
  });
});

describe('getPaymentProvider (test env uses the mock; fails closed otherwise)', () => {
  it('returns the mock provider under the test configuration', () => {
    // tests/setup.ts sets PAYMENT_PROVIDER="mock".
    expect(getPaymentProvider().id).toBe('mock');
  });
});

describe('mapCheckoutError', () => {
  it('maps domain errors to safe, detail-free kinds', () => {
    expect(
      mapCheckoutError(new AuthorizationError(403, 'seller_profile_required')),
    ).toBe('notSeller');
    expect(mapCheckoutError(new AuthorizationError(403, 'seller_frozen'))).toBe(
      'sellerInactive',
    );
    expect(mapCheckoutError(new CheckoutRejectedError('invalid_plan'))).toBe(
      'invalidPlan',
    );
    expect(
      mapCheckoutError(new PaymentConfigError('provider_unavailable')),
    ).toBe('providerUnavailable');
    expect(mapCheckoutError(new PaymentProviderError('boom'))).toBe(
      'providerError',
    );
    const kind = mapCheckoutError(new Error('raw stripe secret sk_live_xyz'));
    expect(kind).toBe('unexpected');
    expect(JSON.stringify(kind)).not.toContain('sk_live');
  });
});

describe('checkoutErrorMessage', () => {
  it('is generic and never leaks provider detail', () => {
    for (const kind of [
      'notSeller',
      'sellerInactive',
      'invalidPlan',
      'providerUnavailable',
      'providerError',
      'unexpected',
    ] as CheckoutErrorKind[]) {
      const msg = checkoutErrorMessage(kind);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg.toLowerCase()).not.toContain('stripe');
      expect(msg.toLowerCase()).not.toContain('provider_');
      expect(msg).not.toMatch(/sk_|pk_|cs_/); // no provider tokens/ids
    }
  });
});

describe('startCheckoutAction', () => {
  it('rejects a missing plan id before touching auth or the provider', async () => {
    const form = new FormData();
    const state = await startCheckoutAction({ status: 'idle' }, form);
    expect(state).toEqual({ status: 'error', error: 'invalidPlan' });
  });
});
