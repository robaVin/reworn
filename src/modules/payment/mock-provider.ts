import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CheckoutSessionRequest,
  PaymentProvider,
  ProviderCheckoutSession,
  ProviderPaymentEvent,
  WebhookRequest,
} from './provider';
import { WebhookVerificationError } from './errors';

/**
 * Development/test payment provider. It creates a DETERMINISTIC fake session
 * from the merchant reference and returns a clearly-fake hosted URL — there is
 * no real payment page and no network call, so tests never touch a live
 * gateway. `PAYMENT_PROVIDER="mock"` is forbidden in production by env
 * validation, so this can never mint a real subscription.
 *
 * Webhooks are verified with an HMAC-SHA256 over the raw body using a fixed
 * mock secret (dev/test only — a real provider reads its signing secret from
 * configuration). This models real signature verification: a wrong/absent
 * signature is rejected.
 */

/** Mock signing secret — NOT a real secret; the mock is prod-forbidden. */
export const MOCK_WEBHOOK_SECRET = 'mock_webhook_signing_secret';
const SIGNATURE_HEADER = 'x-webhook-signature';

/** Compute the mock signature for a raw body (exported so tests can sign). */
export function mockWebhookSignature(rawBody: string): string {
  return createHmac('sha256', MOCK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
}

export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'mock';

  validateConfiguration(): void {
    // The mock has no external configuration to validate.
  }

  async createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<ProviderCheckoutSession> {
    const providerSessionId = `cs_mock_${request.merchantReference}`;
    const checkoutUrl = `https://mock-payments.reworn.local/checkout/${providerSessionId}`;
    return { providerSessionId, checkoutUrl };
  }

  verifyWebhook(request: WebhookRequest): ProviderPaymentEvent {
    const provided = request.header(SIGNATURE_HEADER);
    if (!provided) throw new WebhookVerificationError('missing_signature');

    const expected = mockWebhookSignature(request.rawBody);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new WebhookVerificationError('bad_signature');
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(request.rawBody) as Record<string, unknown>;
    } catch {
      throw new WebhookVerificationError('unparseable_body');
    }
    if (
      typeof payload.providerEventId !== 'string' ||
      !payload.providerEventId
    ) {
      throw new WebhookVerificationError('missing_event_id');
    }

    const kinds = [
      'payment_succeeded',
      'payment_failed',
      'checkout_expired',
    ] as const;
    const kind = (kinds as readonly string[]).includes(payload.kind as string)
      ? (payload.kind as ProviderPaymentEvent['kind'])
      : 'unknown';

    return {
      providerEventId: payload.providerEventId,
      kind,
      merchantReference:
        typeof payload.merchantReference === 'string'
          ? payload.merchantReference
          : undefined,
      providerSessionId:
        typeof payload.providerSessionId === 'string'
          ? payload.providerSessionId
          : undefined,
      amountMinor:
        typeof payload.amountMinor === 'number'
          ? payload.amountMinor
          : undefined,
      currency:
        typeof payload.currency === 'string' ? payload.currency : undefined,
    };
  }
}
