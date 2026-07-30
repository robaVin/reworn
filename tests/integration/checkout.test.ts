import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  CheckoutSessionRequest,
  PaymentProvider,
  ProviderCheckoutSession,
} from '@/modules/payment/provider';

/**
 * Checkout initiation integration: the checkout service + action core against a
 * real embedded Postgres, with INJECTED provider stubs (never a live gateway).
 * Covers authorization, pending-subscription reuse/replacement, provider
 * orchestration, idempotency, redirect, no-activation, and DTO privacy.
 */

const BUYER = 'ba222222-2222-2222-2222-222222222222';

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let core: typeof import('@/modules/payment/checkout-actions');

let planId: string;
let planId2: string;
let seq = 0;

/** Records requests and counts session creations. */
class SpyProvider implements PaymentProvider {
  readonly id = 'mock';
  calls = 0;
  lastRequest: CheckoutSessionRequest | null = null;
  async createCheckoutSession(
    request: CheckoutSessionRequest,
  ): Promise<ProviderCheckoutSession> {
    this.calls += 1;
    this.lastRequest = request;
    return {
      providerSessionId: `cs_${request.merchantReference}`,
      checkoutUrl: `https://pay.example/checkout/${request.merchantReference}`,
    };
  }
  validateConfiguration(): void {}
}

class FailingProvider implements PaymentProvider {
  readonly id = 'mock';
  constructor(private readonly err: Error) {}
  async createCheckoutSession(): Promise<ProviderCheckoutSession> {
    throw this.err;
  }
  validateConfiguration(): void {}
}

async function makeSeller(status = 'active'): Promise<string> {
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
      status: status as 'active',
      handle: `chk-shop-${seq}`,
    },
  });
  return profileId; // the checkout takes a USER id
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-checkout-'));
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
  core = await import('@/modules/payment/checkout-actions');

  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  await prisma.profile.create({ data: { id: BUYER } });
  await prisma.userRole.create({
    data: { profileId: BUYER, roleId: buyerRole.id },
  });

  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { code: 'asc' },
  });
  planId = plans[0]!.id;
  planId2 = plans[1]!.id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('authorization', () => {
  it('an active seller succeeds and is redirected to the provider URL', async () => {
    const seller = await makeSeller();
    const spy = new SpyProvider();
    const out = await core.resolveCheckout(seller, planId, spy);
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.to).toContain('https://pay.example/checkout/');
    expect(spy.calls).toBe(1);
  });

  it('a buyer (no seller profile) is denied — provider is never called', async () => {
    const spy = new SpyProvider();
    const out = await core.resolveCheckout(BUYER, planId, spy);
    expect(out).toEqual({ kind: 'error', error: 'notSeller' });
    expect(spy.calls).toBe(0);
  });

  it('a frozen seller is denied', async () => {
    const seller = await makeSeller('frozen');
    const spy = new SpyProvider();
    const out = await core.resolveCheckout(seller, planId, spy);
    expect(out).toEqual({ kind: 'error', error: 'sellerInactive' });
    expect(spy.calls).toBe(0);
  });

  it('an unknown/invalid plan is rejected', async () => {
    const seller = await makeSeller();
    const spy = new SpyProvider();
    const out = await core.resolveCheckout(
      seller,
      '99999999-9999-9999-9999-999999999999',
      spy,
    );
    expect(out).toEqual({ kind: 'error', error: 'invalidPlan' });
    expect(spy.calls).toBe(0);
  });
});

describe('pending-subscription integration + persisted attempt', () => {
  it('creates a pending subscription (not active) and a reconciliation attempt', async () => {
    const userId = await makeSeller();
    const spy = new SpyProvider();
    const out = await core.resolveCheckout(userId, planId, spy);
    expect(out.kind).toBe('redirect');

    const seller = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: userId },
    });
    const sub = await prisma.subscription.findFirstOrThrow({
      where: { sellerId: seller.id },
    });
    expect(sub.status).toBe('pending'); // NEVER activated at checkout

    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { subscriptionId: sub.id },
    });
    expect(attempt.status).toBe('pending');
    expect(attempt.provider).toBe('mock');
    expect(attempt.providerReference).toBe(`cs_${attempt.merchantReference}`);
    expect(attempt.checkoutUrl).toBeTruthy();
    // Server-computed amount comes from the plan, not the client.
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({
      where: { id: planId },
    });
    expect(spy.lastRequest?.amountMinor).toBe(plan.priceMinor);
    expect(attempt.expectedAmountMinor).toBe(plan.priceMinor);
    expect(spy.lastRequest?.currency).toBe(plan.currency);
    expect(spy.lastRequest?.planCode).toBe(plan.code);
    expect(spy.lastRequest?.merchantReference.startsWith('chk_')).toBe(true);
  });

  it('reuses the SAME-plan pending subscription + open session (provider called once)', async () => {
    const userId = await makeSeller();
    const spy = new SpyProvider();
    const first = await core.resolveCheckout(userId, planId, spy);
    const second = await core.resolveCheckout(userId, planId, spy);
    expect(first.kind === 'redirect' && second.kind === 'redirect').toBe(true);
    if (first.kind === 'redirect' && second.kind === 'redirect') {
      expect(second.to).toBe(first.to); // reused URL
    }
    expect(spy.calls).toBe(1); // no new provider session on repeat

    const seller = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: userId },
    });
    expect(
      await prisma.paymentAttempt.count({ where: { sellerId: seller.id } }),
    ).toBe(1);
  });

  it('a DIFFERENT plan supersedes the pending subscription and starts a new session', async () => {
    const userId = await makeSeller();
    const spy = new SpyProvider();
    await core.resolveCheckout(userId, planId, spy);
    const out2 = await core.resolveCheckout(userId, planId2, spy);
    expect(out2.kind).toBe('redirect');
    expect(spy.calls).toBe(2); // new plan -> new session

    const seller = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: userId },
    });
    // Exactly one pending subscription, for the new plan.
    const pendings = await prisma.subscription.findMany({
      where: { sellerId: seller.id, status: 'pending' },
    });
    expect(pendings).toHaveLength(1);
    expect(pendings[0]!.planId).toBe(planId2);
    // The old pending was superseded (cancelled) in history.
    expect(
      await prisma.subscription.count({
        where: { sellerId: seller.id, status: 'cancelled' },
      }),
    ).toBe(1);
  });

  it('concurrent same-plan initiations persist exactly ONE open attempt', async () => {
    const userId = await makeSeller();
    const spy = new SpyProvider();
    const [a, b] = await Promise.all([
      core.resolveCheckout(userId, planId, spy),
      core.resolveCheckout(userId, planId, spy),
    ]);
    expect(a.kind).toBe('redirect');
    expect(b.kind).toBe('redirect');
    const seller = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: userId },
    });
    const sub = await prisma.subscription.findFirstOrThrow({
      where: { sellerId: seller.id, status: 'pending' },
    });
    // One-open-attempt partial unique => exactly one persisted attempt.
    expect(
      await prisma.paymentAttempt.count({
        where: { subscriptionId: sub.id, status: 'pending' },
      }),
    ).toBe(1);
  });
});

describe('provider failure handling', () => {
  it('maps a provider API failure to a safe error and persists no attempt', async () => {
    const { PaymentProviderError } = await import('@/modules/payment/errors');
    const userId = await makeSeller();
    const out = await core.resolveCheckout(
      userId,
      planId,
      new FailingProvider(new PaymentProviderError('boom')),
    );
    expect(out).toEqual({ kind: 'error', error: 'providerError' });
    const seller = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: userId },
    });
    expect(
      await prisma.paymentAttempt.count({ where: { sellerId: seller.id } }),
    ).toBe(0);
  });

  it('maps a provider CONFIG failure to providerUnavailable', async () => {
    const { PaymentConfigError } = await import('@/modules/payment/errors');
    const userId = await makeSeller();
    const out = await core.resolveCheckout(
      userId,
      planId,
      new FailingProvider(new PaymentConfigError('provider_unavailable')),
    );
    expect(out).toEqual({ kind: 'error', error: 'providerUnavailable' });
  });
});

describe('privacy', () => {
  it('the outcome exposes ONLY a checkout URL — no ids, secrets, or payloads', async () => {
    const userId = await makeSeller();
    const spy = new SpyProvider();
    const out = await core.resolveCheckout(userId, planId, spy);
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    // Exactly { kind, to }.
    expect(Object.keys(out).sort()).toEqual(['kind', 'to']);
    const seller = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: userId },
    });
    expect(out.to).not.toContain(seller.id);
    expect(out.to).not.toContain(userId);
    const blob = JSON.stringify(out);
    for (const key of ['providerReference', 'apiKey', 'secret', 'customer']) {
      expect(blob).not.toContain(key);
    }
  });
});
