/**
 * Payment-domain errors. Authorization failures reuse `AuthorizationError`.
 * These carry NO raw provider detail — the service maps them to safe kinds.
 */

/** The payment provider is not configured / unavailable (fail closed, 503). */
export class PaymentConfigError extends Error {
  readonly status = 503 as const;
  constructor(readonly reason: string) {
    super(`payment_config:${reason}`);
    this.name = 'PaymentConfigError';
  }
}

/** A provider-side failure creating a session (502). Never carries the raw
 * provider error/message to the client. */
export class PaymentProviderError extends Error {
  readonly status = 502 as const;
  constructor(readonly reason: string) {
    super(`payment_provider:${reason}`);
    this.name = 'PaymentProviderError';
  }
}

/** The checkout request was rejected (e.g. an unknown/inactive plan) (400). */
export class CheckoutRejectedError extends Error {
  readonly status = 400 as const;
  constructor(readonly reason: string) {
    super(`checkout_rejected:${reason}`);
    this.name = 'CheckoutRejectedError';
  }
}

/** A webhook failed signature verification or could not be parsed (400). The
 * endpoint maps this to a generic 400 — never echoing the reason to the caller. */
export class WebhookVerificationError extends Error {
  readonly status = 400 as const;
  constructor(readonly reason: string) {
    super(`webhook_verification:${reason}`);
    this.name = 'WebhookVerificationError';
  }
}
