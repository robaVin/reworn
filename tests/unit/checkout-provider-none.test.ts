import { describe, it, expect, vi } from 'vitest';

// Fail-closed: with no payment provider configured, the factory must refuse.
vi.mock('@/lib/env', () => ({ env: { PAYMENT_PROVIDER: 'none' } }));

const { getPaymentProvider } =
  await import('@/modules/payment/provider-factory');
const { PaymentConfigError } = await import('@/modules/payment/errors');

describe('getPaymentProvider — provider unavailable', () => {
  it('throws PaymentConfigError when PAYMENT_PROVIDER is "none" (no silent fallback)', () => {
    expect(() => getPaymentProvider()).toThrow(PaymentConfigError);
  });
});
