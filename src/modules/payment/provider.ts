/**
 * Payment provider abstraction (Increment 4B). The checkout service depends ONLY
 * on this interface; no provider SDK/detail leaks past an implementation.
 * Provider-neutral — Stripe/CaSys/mock all implement the same shape.
 *
 * 4B creates checkout sessions and redirects. Activation is NOT here — a
 * subscription is only ever activated by verified webhook processing (4C).
 */

/** What the service asks a provider to host a checkout for. Server-computed —
 * the amount/plan come from the DB, never from the client. */
export interface CheckoutSessionRequest {
  /** Our globally-unique idempotency reference, echoed back by the provider. */
  merchantReference: string;
  sellerId: string;
  planCode: string;
  planName: string;
  amountMinor: number;
  currency: string;
  /** Where the provider returns the seller after success / cancellation. */
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

/** The minimum provider state the service persists + uses. */
export interface ProviderCheckoutSession {
  /** The provider's session/reference id — used later for webhook reconciliation. */
  providerSessionId: string;
  /** The provider-hosted URL to redirect the seller to. */
  checkoutUrl: string;
}

export interface PaymentProvider {
  /** Stable provider id (e.g. 'mock', 'stripe'), persisted on the attempt. */
  readonly id: string;
  /**
   * Validate that this provider is fully configured to create sessions. Throws
   * `PaymentConfigError` on misconfiguration (fail closed) — never silently
   * degrades.
   */
  validateConfiguration(): void;
  /**
   * Create a provider-hosted checkout session. Throws `PaymentProviderError` on
   * a provider-side failure (the raw provider error never propagates to callers).
   */
  createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<ProviderCheckoutSession>;
}
