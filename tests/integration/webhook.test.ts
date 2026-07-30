import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PaymentAttempt } from '@prisma/client';
import type { ProviderPaymentEvent } from '@/modules/payment/provider';

/**
 * Webhook processing integration — activation, replay protection, out-of-order
 * handling, amount integrity, and the endpoint — against a real embedded
 * Postgres. Activation happens ONLY here.
 */

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let checkoutSvc: typeof import('@/modules/payment/checkout-service');
let subSvc: typeof import('@/modules/subscription/subscription-service');
let webhookSvc: typeof import('@/modules/payment/webhook-service');
let mock: typeof import('@/modules/payment/mock-provider');
let route: typeof import('@/app/api/payments/webhook/route');

let planId: string;
let seq = 0;

async function makeSeller(): Promise<string> {
  seq += 1;
  const profileId = randomUUID();
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  await prisma.profile.create({ data: { id: profileId } });
  await prisma.userRole.create({ data: { profileId, roleId: sellerRole.id } });
  await prisma.sellerProfile.create({
    data: {
      profileId,
      shopName: `Shop ${seq}`,
      status: 'active',
      handle: `wh-shop-${seq}`,
    },
  });
  return profileId;
}

/** Run checkout (mock provider) and return the created payment attempt. */
async function startCheckout(userId: string): Promise<PaymentAttempt> {
  await checkoutSvc.initiateCheckout(userId, planId);
  const seller = await prisma.sellerProfile.findUniqueOrThrow({
    where: { profileId: userId },
  });
  return prisma.paymentAttempt.findFirstOrThrow({
    where: { sellerId: seller.id, status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
}

const succeeded = (
  attempt: PaymentAttempt,
  providerEventId: string,
  over: Partial<ProviderPaymentEvent> = {},
): ProviderPaymentEvent => ({
  providerEventId,
  kind: 'payment_succeeded',
  merchantReference: attempt.merchantReference,
  amountMinor: attempt.expectedAmountMinor,
  currency: attempt.expectedCurrency,
  ...over,
});

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-webhook-'));
  server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
  });
  await server.initialise();
  await server.start();
  await server.createDatabase('reworn');

  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
  execSync('npx tsx prisma/seed.ts', { stdio: 'pipe', env });

  ({ prisma } = await import('@/lib/db'));
  checkoutSvc = await import('@/modules/payment/checkout-service');
  subSvc = await import('@/modules/subscription/subscription-service');
  webhookSvc = await import('@/modules/payment/webhook-service');
  mock = await import('@/modules/payment/mock-provider');
  route = await import('@/app/api/payments/webhook/route');

  const plan = await prisma.subscriptionPlan.findFirstOrThrow();
  planId = plan.id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('activation (only via webhook)', () => {
  it('a succeeded payment activates the pending subscription atomically', async () => {
    const attempt = await startCheckout(await makeSeller());
    const res = await webhookSvc.processWebhookEvent(
      succeeded(attempt, 'evt_a'),
    );
    expect(res.outcome).toBe('activated');

    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: attempt.subscriptionId! },
    });
    expect(sub.status).toBe('active');
    expect(sub.currentPeriodEnd).not.toBeNull();
    expect(sub.graceEndsAt).not.toBeNull();

    const a = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(a.status).toBe('succeeded');
    expect(a.processedAt).not.toBeNull();

    expect(
      await prisma.paymentEvent.count({
        where: { providerEventId: 'evt_a' },
      }),
    ).toBe(1);
    const activation = await prisma.subscriptionEvent.findFirst({
      where: { subscriptionId: sub.id, toStatus: 'active' },
    });
    expect(activation?.reason).toBe('payment_verified');
    expect(activation?.paymentAttemptId).toBe(attempt.id);
  });
});

describe('idempotency + out-of-order', () => {
  it('a replay of the SAME event id is a no-op', async () => {
    const attempt = await startCheckout(await makeSeller());
    await webhookSvc.processWebhookEvent(succeeded(attempt, 'evt_dup'));
    const res = await webhookSvc.processWebhookEvent(
      succeeded(attempt, 'evt_dup'),
    );
    expect(res.outcome).toBe('replay');
    expect(
      await prisma.paymentEvent.count({
        where: { providerEventId: 'evt_dup' },
      }),
    ).toBe(1);
    // Exactly one activation event.
    expect(
      await prisma.subscriptionEvent.count({
        where: { subscriptionId: attempt.subscriptionId!, toStatus: 'active' },
      }),
    ).toBe(1);
  });

  it('a DIFFERENT event id for an already-succeeded attempt does not re-activate', async () => {
    const attempt = await startCheckout(await makeSeller());
    await webhookSvc.processWebhookEvent(succeeded(attempt, 'evt_x1'));
    const res = await webhookSvc.processWebhookEvent(
      succeeded(attempt, 'evt_x2'),
    );
    expect(res.outcome).toBe('already_active');
    expect(
      await prisma.subscriptionEvent.count({
        where: { subscriptionId: attempt.subscriptionId!, toStatus: 'active' },
      }),
    ).toBe(1); // not re-activated
  });

  it('a late payment_failed after success does NOT downgrade', async () => {
    const attempt = await startCheckout(await makeSeller());
    await webhookSvc.processWebhookEvent(succeeded(attempt, 'evt_s'));
    const res = await webhookSvc.processWebhookEvent({
      providerEventId: 'evt_late_fail',
      kind: 'payment_failed',
      merchantReference: attempt.merchantReference,
    });
    expect(res.outcome).toBe('ignored_after_success');
    const a = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(a.status).toBe('succeeded');
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: attempt.subscriptionId! },
    });
    expect(sub.status).toBe('active');
  });
});

describe('failure, expiry, amount integrity, unknowns', () => {
  it('a payment_failed marks the attempt failed and leaves the subscription pending', async () => {
    const attempt = await startCheckout(await makeSeller());
    const res = await webhookSvc.processWebhookEvent({
      providerEventId: 'evt_fail',
      kind: 'payment_failed',
      merchantReference: attempt.merchantReference,
    });
    expect(res.outcome).toBe('payment_failed_recorded');
    const a = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(a.status).toBe('failed');
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: attempt.subscriptionId! },
    });
    expect(sub.status).toBe('pending');
  });

  it('a mismatched amount is refused — never activates', async () => {
    const attempt = await startCheckout(await makeSeller());
    const res = await webhookSvc.processWebhookEvent(
      succeeded(attempt, 'evt_amt', {
        amountMinor: attempt.expectedAmountMinor + 1,
      }),
    );
    expect(res.outcome).toBe('amount_mismatch');
    const a = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    expect(a.status).toBe('pending');
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: attempt.subscriptionId! },
    });
    expect(sub.status).toBe('pending');
  });

  it('an event for an unknown attempt / unknown kind is ignored', async () => {
    expect(
      (
        await webhookSvc.processWebhookEvent({
          providerEventId: 'evt_none',
          kind: 'payment_succeeded',
          merchantReference: 'chk_does_not_exist',
        })
      ).outcome,
    ).toBe('ignored_no_attempt');
    expect(
      (
        await webhookSvc.processWebhookEvent({
          providerEventId: 'evt_unknown_kind',
          kind: 'unknown',
        })
      ).outcome,
    ).toBe('ignored_unknown');
  });

  it('does not create a second live subscription (conflict is skipped)', async () => {
    const userId = await makeSeller();
    // First subscription -> activate it.
    const a1 = await startCheckout(userId);
    await subSvc.activateSubscription(a1.subscriptionId!, {
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date('2100-01-01T00:00:00.000Z'),
    });
    // A second checkout while one is live -> a new pending + attempt.
    const a2 = await startCheckout(userId);
    expect(a2.subscriptionId).not.toBe(a1.subscriptionId);

    const res = await webhookSvc.processWebhookEvent(succeeded(a2, 'evt_conf'));
    expect(res.outcome).toBe('conflict_existing_live');
    const sub2 = await prisma.subscription.findUniqueOrThrow({
      where: { id: a2.subscriptionId! },
    });
    expect(sub2.status).toBe('pending'); // NOT activated
    // The first subscription is untouched and still the only live one.
    expect(
      await prisma.subscription.count({
        where: {
          sellerId: sub2.sellerId,
          status: { in: ['active', 'grace_period'] },
        },
      }),
    ).toBe(1);
  });
});

describe('webhook endpoint', () => {
  const post = (rawBody: string, signature?: string) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (signature !== undefined) headers.set('x-webhook-signature', signature);
    return route.POST(
      new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers,
        body: rawBody,
      }) as never,
    );
  };

  it('accepts a correctly-signed event and activates (200)', async () => {
    const attempt = await startCheckout(await makeSeller());
    const raw = JSON.stringify(succeeded(attempt, 'evt_http'));
    const res = await post(raw, mock.mockWebhookSignature(raw));
    expect(res.status).toBe(200);
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: attempt.subscriptionId! },
    });
    expect(sub.status).toBe('active');
  });

  it('rejects a bad signature (400) and activates nothing', async () => {
    const attempt = await startCheckout(await makeSeller());
    const raw = JSON.stringify(succeeded(attempt, 'evt_badsig'));
    const res = await post(raw, 'not-a-valid-signature');
    expect(res.status).toBe(400);
    const sub = await prisma.subscription.findUniqueOrThrow({
      where: { id: attempt.subscriptionId! },
    });
    expect(sub.status).toBe('pending');
  });

  it('rejects GET with 405', async () => {
    expect(route.GET().status).toBe(405);
  });
});
