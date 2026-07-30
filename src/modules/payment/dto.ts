/**
 * Checkout DTOs — the ONLY checkout shapes that leave the module.
 *
 * Privacy contract (asserted by tests): the DTO carries ONLY the provider-hosted
 * checkout URL the seller is redirected to. It never contains provider secrets,
 * API keys, customer identifiers, our internal ids (attempt/subscription/seller),
 * or raw provider payloads.
 */
export interface CheckoutSessionDTO {
  /** The provider-hosted URL to redirect the seller to. */
  checkoutUrl: string;
}
