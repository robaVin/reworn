import type {
  CheckoutSessionRequest,
  PaymentProvider,
  ProviderCheckoutSession,
} from './provider';

/**
 * Development/test payment provider. It creates a DETERMINISTIC fake session
 * from the merchant reference and returns a clearly-fake hosted URL — there is
 * no real payment page and no network call, so tests never touch a live
 * gateway. `PAYMENT_PROVIDER="mock"` is forbidden in production by env
 * validation, so this can never mint a real subscription.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';

  validateConfiguration(): void {
    // The mock has no external configuration to validate.
  }

  async createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<ProviderCheckoutSession> {
    const providerSessionId = `cs_mock_${request.merchantReference}`;
    // A deliberately non-real, provider-hosted-looking URL.
    const checkoutUrl = `https://mock-payments.reworn.local/checkout/${providerSessionId}`;
    return { providerSessionId, checkoutUrl };
  }
}
