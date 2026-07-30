import { describe, it, expect } from 'vitest';
import {
  MockPaymentProvider,
  mockWebhookSignature,
} from '@/modules/payment/mock-provider';
import { WebhookVerificationError } from '@/modules/payment/errors';

const provider = new MockPaymentProvider();

/** Build a WebhookRequest with a (possibly wrong) signature header. */
function req(rawBody: string, signature?: string) {
  const headers: Record<string, string> = {};
  if (signature !== undefined) headers['x-webhook-signature'] = signature;
  return {
    rawBody,
    header: (name: string) => headers[name.toLowerCase()],
  };
}

const body = (o: unknown) => JSON.stringify(o);

describe('MockPaymentProvider.verifyWebhook', () => {
  it('parses a correctly-signed event', () => {
    const raw = body({
      providerEventId: 'evt_1',
      kind: 'payment_succeeded',
      merchantReference: 'chk_1',
      amountMinor: 30000,
      currency: 'MKD',
    });
    const event = provider.verifyWebhook(req(raw, mockWebhookSignature(raw)));
    expect(event).toMatchObject({
      providerEventId: 'evt_1',
      kind: 'payment_succeeded',
      merchantReference: 'chk_1',
      amountMinor: 30000,
      currency: 'MKD',
    });
  });

  it('rejects a missing signature', () => {
    const raw = body({ providerEventId: 'e', kind: 'payment_succeeded' });
    expect(() => provider.verifyWebhook(req(raw))).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects a wrong signature', () => {
    const raw = body({ providerEventId: 'e', kind: 'payment_succeeded' });
    expect(() => provider.verifyWebhook(req(raw, 'deadbeef'))).toThrow(
      WebhookVerificationError,
    );
  });

  it('rejects an unparseable (but correctly-signed) body', () => {
    const raw = 'not json';
    expect(() =>
      provider.verifyWebhook(req(raw, mockWebhookSignature(raw))),
    ).toThrow(WebhookVerificationError);
  });

  it('requires an event id', () => {
    const raw = body({ kind: 'payment_succeeded' });
    expect(() =>
      provider.verifyWebhook(req(raw, mockWebhookSignature(raw))),
    ).toThrow(WebhookVerificationError);
  });

  it('normalises an unrecognised kind to "unknown"', () => {
    const raw = body({ providerEventId: 'e', kind: 'refund.created' });
    const event = provider.verifyWebhook(req(raw, mockWebhookSignature(raw)));
    expect(event.kind).toBe('unknown');
  });
});
