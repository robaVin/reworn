import { NextResponse, type NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getPaymentProvider } from '@/modules/payment/provider-factory';
import { processWebhookEvent } from '@/modules/payment/webhook-service';
import {
  PaymentConfigError,
  WebhookVerificationError,
} from '@/modules/payment/errors';

/**
 * Provider payment webhook — the ONLY path that activates a subscription.
 *
 * Security is the SIGNATURE, not a session: this endpoint takes no auth and is
 * POST-only. The raw body is verified by the provider before anything is
 * trusted. It fails closed when no provider is configured (503). Processing is
 * idempotent + out-of-order safe (see the webhook service), so a provider may
 * safely retry; we always return 2xx once an event has been accepted.
 *
 * Node runtime (Prisma + crypto). No provider secret / raw payload / customer id
 * is ever logged — only the event kind and the processing outcome.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text();

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (e) {
    if (e instanceof PaymentConfigError) {
      return NextResponse.json({ error: 'unavailable' }, { status: 503 });
    }
    throw e;
  }

  let event;
  try {
    event = provider.verifyWebhook({
      rawBody,
      header: (name) => request.headers.get(name) ?? undefined,
    });
  } catch (e) {
    if (e instanceof WebhookVerificationError) {
      // Never echo the reason — a bad/absent signature is a generic 400.
      logger.warn('payment webhook rejected', { reason: 'verification' });
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    throw e;
  }

  try {
    const result = await processWebhookEvent(event);
    logger.info('payment webhook processed', {
      kind: event.kind,
      outcome: result.outcome,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    // Unexpected failure: log safely and 5xx so the provider retries (the retry
    // is deduplicated by provider_event_id).
    logger.error('payment webhook processing failed', { error });
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}

/** Webhooks are POST-only. */
export function GET(): NextResponse {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
