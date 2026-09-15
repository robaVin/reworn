import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Subscription domain integration: lifecycle transitions + immutable events,
 * one-live / one-pending idempotency, entitlement resolution, the owner-scoped
 * DTO, and the RLS read policies — all against a real embedded Postgres.
 */

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/subscription/subscription-service');
let providerEvents: typeof import('@/modules/subscription/provider-events');
let InvalidSubscriptionTransitionError: typeof import('@/modules/subscription/subscription-status').InvalidSubscriptionTransitionError;
let SubscriptionConflictError: typeof import('@/modules/subscription/errors').SubscriptionConflictError;

let planId: string;
let planId2: string;
let seq = 0;
let mref = 0;

/** Create an isolated active seller (own profile + seller profile). */
async function makeSeller(): Promise<{ profileId: string; sellerId: string }> {
  seq += 1;
  const profileId = randomUUID();
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  await prisma.profile.create({ data: { id: profileId } });
  await prisma.userRole.create({
    data: { profileId, roleId: sellerRole.id },
  });
  const seller = await prisma.sellerProfile.create({
    data: {
      profileId,
      shopName: `Shop ${seq}`,
      status: 'active',
      handle: `sub-shop-${seq}`,
    },
  });
  return { profileId, sellerId: seller.id };
}

const period = () => ({
  currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-08-01T00:00:00.000Z'),
  graceEndsAt: new Date('2026-08-08T00:00:00.000Z'),
});

async function runAs(
  identity: string | 'anon',
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  await sql.query('BEGIN');
  try {
    if (identity === 'anon') {
      await sql.query('SET LOCAL ROLE anon');
    } else {
      await sql.query('SET LOCAL ROLE authenticated');
      await sql.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: identity }),
      ]);
    }
    const res = await sql.query(text, params);
    await sql.query('ROLLBACK');
    return res;
  } catch (e) {
    await sql.query('ROLLBACK');
    throw e;
  }
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-sub-'));
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
  svc = await import('@/modules/subscription/subscription-service');
  providerEvents = await import('@/modules/subscription/provider-events');
  ({ InvalidSubscriptionTransitionError } =
    await import('@/modules/subscription/subscription-status'));
  ({ SubscriptionConflictError } =
    await import('@/modules/subscription/errors'));

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: { code: 'asc' },
  });
  planId = plans[0]!.id;
  planId2 = plans[1]!.id; // a DIFFERENT plan for replacement tests
}, 180_000);

/** Minimal payment attempt to attach provider events to. */
async function makePaymentAttempt(
  sellerId: string,
  profileId: string,
): Promise<string> {
  mref += 1;
  const a = await prisma.paymentAttempt.create({
    data: {
      merchantReference: `mref-${mref}`,
      profileId,
      sellerId,
      planId,
      expectedAmountMinor: 30000,
      expectedCurrency: 'MKD',
      provider: 'mock',
      expiresAt: new Date(Date.now() + 3600_000),
    },
    select: { id: true },
  });
  return a.id;
}

afterAll(async () => {
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('createPendingSubscription — idempotent + race-safe', () => {
  it('sequential + concurrent calls converge on ONE pending row with a created event', async () => {
    const { sellerId } = await makeSeller();
    const first = await svc.createPendingSubscription(sellerId, planId);
    const second = await svc.createPendingSubscription(sellerId, planId);
    expect(second.id).toBe(first.id);

    const { sellerId: s2 } = await makeSeller();
    const [a, b] = await Promise.all([
      svc.createPendingSubscription(s2, planId),
      svc.createPendingSubscription(s2, planId),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.subscription.count({
        where: { sellerId: s2, status: 'pending' },
      }),
    ).toBe(1);

    // Exactly one 'created' event for the single row.
    const events = await prisma.subscriptionEvent.findMany({
      where: { subscriptionId: a.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.toStatus).toBe('pending');
    expect(events[0]!.fromStatus).toBeNull();
  });

  it('the one-pending partial unique index exists', async () => {
    const { rows } = await sql.query(
      `SELECT indexname FROM pg_indexes WHERE tablename='subscriptions'`,
    );
    const names = rows.map((r: { indexname: string }) => r.indexname);
    expect(names).toContain('ux_one_pending_subscription_per_seller');
    expect(names).toContain('ux_one_live_subscription_per_seller');
  });
});

describe('activation + one-live backstop + immutable events', () => {
  it('activates pending -> active, stamps the period, and records an event', async () => {
    const { sellerId } = await makeSeller();
    const pending = await svc.createPendingSubscription(sellerId, planId);
    const active = await svc.activateSubscription(pending.id, period());
    expect(active.status).toBe('active');
    expect(active.currentPeriodEnd).not.toBeNull();

    const events = await prisma.subscriptionEvent.findMany({
      where: { subscriptionId: pending.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.toStatus)).toEqual(['pending', 'active']);
  });

  it('rejects activating a second subscription while one is live (one-live backstop)', async () => {
    const { sellerId } = await makeSeller();
    const p1 = await svc.createPendingSubscription(sellerId, planId);
    await svc.activateSubscription(p1.id, period());
    // A second pending is allowed (disjoint slot); activating it collides.
    const p2 = await prisma.subscription.create({
      data: { sellerId, planId, status: 'pending' },
    });
    await expect(
      svc.activateSubscription(p2.id, period()),
    ).rejects.toBeInstanceOf(SubscriptionConflictError);
  });

  it('subscription_events are append-only (UPDATE blocked)', async () => {
    const { sellerId } = await makeSeller();
    const p = await svc.createPendingSubscription(sellerId, planId);
    const ev = await prisma.subscriptionEvent.findFirstOrThrow({
      where: { subscriptionId: p.id },
    });
    await expect(
      sql.query(`UPDATE subscription_events SET reason='x' WHERE id=$1`, [
        ev.id,
      ]),
    ).rejects.toThrow();
  });
});

describe('lifecycle transitions', () => {
  it('active -> grace -> recover -> active, and cancel/suspend/reinstate', async () => {
    const { sellerId } = await makeSeller();
    const p = await svc.createPendingSubscription(sellerId, planId);
    await svc.activateSubscription(p.id, period());

    let s = await svc.transitionSubscription(p.id, 'enter_grace', {
      reason: 'period_ended',
    });
    expect(s.status).toBe('grace_period');
    s = await svc.transitionSubscription(p.id, 'recover', {
      reason: 'renewed',
    });
    expect(s.status).toBe('active');
    s = await svc.transitionSubscription(p.id, 'suspend', { reason: 'admin' });
    expect(s.status).toBe('suspended');
    s = await svc.transitionSubscription(p.id, 'reinstate', {
      reason: 'admin',
    });
    expect(s.status).toBe('active');
    s = await svc.transitionSubscription(p.id, 'cancel', {
      reason: 'by_seller',
    });
    expect(s.status).toBe('cancelled');

    const events = await prisma.subscriptionEvent.findMany({
      where: { subscriptionId: p.id },
    });
    // created, activated, enter_grace, recover, suspend, reinstate, cancel
    expect(events.length).toBe(7);
  });

  it('rejects an illegal transition', async () => {
    const { sellerId } = await makeSeller();
    const p = await svc.createPendingSubscription(sellerId, planId);
    await expect(
      svc.transitionSubscription(p.id, 'recover', { reason: 'nope' }),
    ).rejects.toBeInstanceOf(InvalidSubscriptionTransitionError);
  });
});

describe('hasActiveSubscription + entitlement resolution', () => {
  it('reflects the live, grace, expired, suspended, and none states', async () => {
    const none = await makeSeller();
    expect(await svc.hasActiveSubscription(none.sellerId)).toBe(false);

    const live = await makeSeller();
    const lp = await svc.createPendingSubscription(live.sellerId, planId);
    await svc.activateSubscription(lp.id, {
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2100-01-01T00:00:00.000Z'),
    });
    expect(await svc.hasActiveSubscription(live.sellerId)).toBe(true);

    // Grace whose window has already elapsed -> not entitling (sweep-resilient).
    const stale = await makeSeller();
    const sp = await svc.createPendingSubscription(stale.sellerId, planId);
    await svc.activateSubscription(sp.id, period());
    await svc.transitionSubscription(sp.id, 'enter_grace', {
      reason: 'ended',
      patch: { graceEndsAt: new Date('2000-01-01T00:00:00.000Z') },
    });
    expect(await svc.hasActiveSubscription(stale.sellerId)).toBe(false);
  });

  it('resolves a rich, self-consistent entitlement', async () => {
    const { sellerId } = await makeSeller();
    // No subscription.
    const e0 = await svc.resolveSellerEntitlement(sellerId, 'active');
    expect(e0.hasActiveSubscription).toBe(false);
    expect(e0.plan).toBeNull();
    expect(e0.status).toBeNull();
    expect(e0.canPublishListings).toBe(!e0.enforced); // active seller, no sub

    // Active subscription.
    const p = await svc.createPendingSubscription(sellerId, planId);
    await svc.activateSubscription(p.id, {
      currentPeriodStart: new Date('2026-07-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2100-01-01T00:00:00.000Z'),
    });
    const e1 = await svc.resolveSellerEntitlement(sellerId, 'active');
    expect(e1.hasActiveSubscription).toBe(true);
    expect(e1.status).toBe('active');
    expect(e1.plan?.code).toBeTruthy();
    expect(e1.weeklyListingQuota).toBe(e1.plan!.weeklyListingQuota);
    expect(e1.canPublishListings).toBe(true);

    // A frozen seller cannot publish even with a live subscription.
    const eFrozen = await svc.resolveSellerEntitlement(sellerId, 'frozen');
    expect(eFrozen.canPublishListings).toBe(false);
  });
});

describe('owner-scoped DTO + privacy', () => {
  it('returns the seller their own subscription with no ids/financials', async () => {
    const { profileId, sellerId } = await makeSeller();
    const p = await svc.createPendingSubscription(sellerId, planId);
    await svc.activateSubscription(p.id, period());

    const dto = await svc.getSubscriptionForUser(profileId);
    expect(dto).not.toBeNull();
    expect(dto!.status).toBe('active');
    expect(dto!.plan.code).toBeTruthy();

    const blob = JSON.stringify(dto);
    for (const id of [profileId, sellerId, p.id, planId]) {
      expect(blob).not.toContain(id);
    }
    for (const key of [
      'sellerId',
      'planId',
      'subscriptionId',
      'merchant',
      'paymentAttempt',
    ]) {
      expect(blob).not.toContain(key);
    }
  });

  it('a user with no seller profile gets null', async () => {
    const noSeller = randomUUID();
    await prisma.profile.create({ data: { id: noSeller } });
    expect(await svc.getSubscriptionForUser(noSeller)).toBeNull();
  });
});

describe('RLS reads', () => {
  it('a seller reads only their own subscriptions; others and anon see none', async () => {
    const owner = await makeSeller();
    const other = await makeSeller();
    const p = await svc.createPendingSubscription(owner.sellerId, planId);
    await svc.activateSubscription(p.id, period());

    const asOwner = await runAs(
      owner.profileId,
      `SELECT count(*)::int n FROM subscriptions WHERE id=$1`,
      [p.id],
    );
    expect(asOwner.rows[0].n).toBe(1);

    const asOther = await runAs(
      other.profileId,
      `SELECT count(*)::int n FROM subscriptions WHERE id=$1`,
      [p.id],
    );
    expect(asOther.rows[0].n).toBe(0);

    const asAnon = await runAs(
      'anon',
      `SELECT count(*)::int n FROM subscriptions`,
    ).catch(() => ({ rows: [{ n: 0 }] }) as unknown as pg.QueryResult);
    expect(asAnon.rows[0].n).toBe(0);
  });

  it('a user cannot INSERT a subscription directly (no write grant)', async () => {
    const owner = await makeSeller();
    await expect(
      runAs(
        owner.profileId,
        `INSERT INTO subscriptions (id, seller_id, plan_id, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'active', now())`,
        [owner.sellerId, planId],
      ),
    ).rejects.toThrow();
  });
});

describe('pending-plan replacement (plan-correct + deterministic)', () => {
  it('same plan sequential + concurrent requests reuse ONE pending row', async () => {
    const { sellerId } = await makeSeller();
    const a = await svc.createPendingSubscription(sellerId, planId);
    const b = await svc.createPendingSubscription(sellerId, planId);
    expect(b.id).toBe(a.id);
    expect(b.planId).toBe(planId);

    const [c, d] = await Promise.all([
      svc.createPendingSubscription(sellerId, planId),
      svc.createPendingSubscription(sellerId, planId),
    ]);
    expect(c.id).toBe(a.id);
    expect(d.id).toBe(a.id);
    expect(
      await prisma.subscription.count({
        where: { sellerId, status: 'pending' },
      }),
    ).toBe(1);
  });

  it('a DIFFERENT plan supersedes the old pending and returns the requested plan', async () => {
    const { sellerId } = await makeSeller();
    const first = await svc.createPendingSubscription(sellerId, planId);
    const second = await svc.createPendingSubscription(sellerId, planId2);

    expect(second.id).not.toBe(first.id);
    expect(second.planId).toBe(planId2); // returned matches requested plan
    // Exactly one pending remains, for the requested plan.
    const pendings = await prisma.subscription.findMany({
      where: { sellerId, status: 'pending' },
    });
    expect(pendings).toHaveLength(1);
    expect(pendings[0]!.id).toBe(second.id);
    // The superseded row survives in history as cancelled.
    const old = await prisma.subscription.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(old.status).toBe('cancelled');
    // Its cancellation event describes the outcome accurately.
    const ev = await prisma.subscriptionEvent.findFirstOrThrow({
      where: { subscriptionId: first.id, toStatus: 'cancelled' },
    });
    expect(ev.reason).toBe('superseded_by_plan_change');
    expect(ev.fromStatus).toBe('pending');
  });

  it('concurrent requests for two DIFFERENT plans leave exactly one pending; each caller gets its requested plan', async () => {
    const { sellerId } = await makeSeller();
    const [a, b] = await Promise.all([
      svc.createPendingSubscription(sellerId, planId),
      svc.createPendingSubscription(sellerId, planId2),
    ]);
    // Each caller received a subscription for the plan it requested.
    expect(a.planId).toBe(planId);
    expect(b.planId).toBe(planId2);
    // Deterministic invariant: exactly ONE pending row remains (last committed
    // wins); the earlier one is cancelled in history.
    const pendings = await prisma.subscription.findMany({
      where: { sellerId, status: 'pending' },
    });
    expect(pendings).toHaveLength(1);
    const cancelled = await prisma.subscription.count({
      where: { sellerId, status: 'cancelled' },
    });
    expect(cancelled).toBeGreaterThanOrEqual(1);
    // No pending row is ever for a plan nobody requested.
    expect([planId, planId2]).toContain(pendings[0]!.planId);
  });
});

describe('provider-event idempotency (webhook replay protection)', () => {
  it('the provider_event_id unique index exists', async () => {
    const { rows } = await sql.query(
      `SELECT indexname FROM pg_indexes WHERE tablename='payment_events'`,
    );
    const names = rows.map((r: { indexname: string }) => r.indexname);
    expect(names).toContain('ux_payment_events_provider_event_id');
  });

  it('records an event once and applies its transition; a replay is a no-op reuse', async () => {
    const { sellerId, profileId } = await makeSeller();
    const attempt = await makePaymentAttempt(sellerId, profileId);
    const providerEventId = `evt_${randomUUID()}`;

    // A side-effect that must run EXACTLY once (models a domain transition).
    let applied = 0;
    const apply = async () => {
      applied += 1;
    };

    const first = await providerEvents.recordProviderEventOnce(
      {
        paymentAttemptId: attempt,
        providerEventId,
        type: 'verified',
        toStatus: 'succeeded',
      },
      apply,
    );
    expect(first.isReplay).toBe(false);
    expect(applied).toBe(1);

    // Repeat delivery of the SAME provider event id.
    const replay = await providerEvents.recordProviderEventOnce(
      {
        paymentAttemptId: attempt,
        providerEventId,
        type: 'verified',
        toStatus: 'succeeded',
      },
      apply,
    );
    expect(replay.isReplay).toBe(true);
    expect(replay.event.id).toBe(first.event.id); // reusable result
    expect(applied).toBe(1); // transition did NOT run again

    // No duplicate payment_event row.
    expect(
      await prisma.paymentEvent.count({ where: { providerEventId } }),
    ).toBe(1);
  });

  it('a duplicate rolls back BOTH the event insert and the domain transition', async () => {
    const { sellerId, profileId } = await makeSeller();
    const attempt = await makePaymentAttempt(sellerId, profileId);
    const providerEventId = `evt_${randomUUID()}`;
    await providerEvents.recordProviderEventOnce({
      paymentAttemptId: attempt,
      providerEventId,
      type: 'verified',
      toStatus: 'succeeded',
    });

    const before = await prisma.subscriptionEvent.count();
    // The replay's `apply` would write a subscription event; it must be rolled back.
    const replay = await providerEvents.recordProviderEventOnce(
      {
        paymentAttemptId: attempt,
        providerEventId,
        type: 'verified',
        toStatus: 'succeeded',
      },
      async (tx) => {
        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: randomUUID(),
            toStatus: 'active',
            reason: 'should_not_persist',
          },
        });
      },
    );
    expect(replay.isReplay).toBe(true);
    expect(await prisma.subscriptionEvent.count()).toBe(before); // no leak
  });
});

describe('lifecycle sweep + cancellation (P1.4)', () => {
  /** Create a subscription row directly in a chosen state. */
  async function mkSub(
    sellerId: string,
    over: {
      status: 'active' | 'grace_period' | 'expired';
      currentPeriodEnd?: Date | null;
      graceEndsAt?: Date | null;
      cancelAt?: Date | null;
    },
  ): Promise<string> {
    const row = await prisma.subscription.create({
      data: {
        sellerId,
        planId,
        status: over.status,
        currentPeriodStart: new Date('2020-01-01T00:00:00.000Z'),
        currentPeriodEnd: over.currentPeriodEnd ?? null,
        graceEndsAt: over.graceEndsAt ?? null,
        cancelAt: over.cancelAt ?? null,
      },
      select: { id: true },
    });
    return row.id;
  }

  it('active + period ended -> grace_period with a graceEndsAt', async () => {
    const { sellerId } = await makeSeller();
    const periodEnd = new Date('2020-06-01T00:00:00.000Z');
    const id = await mkSub(sellerId, {
      status: 'active',
      currentPeriodEnd: periodEnd,
    });

    const res = await svc.sweepSubscriptionLifecycle(
      new Date('2020-06-02T00:00:00.000Z'),
    );
    expect(res.enteredGrace).toBeGreaterThanOrEqual(1);

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(sub.status).toBe('grace_period');
    expect(sub.graceEndsAt?.getTime()).toBe(
      periodEnd.getTime() + 7 * 86_400_000, // grace = 7 days in tests
    );
    const ev = await prisma.subscriptionEvent.findFirst({
      where: { subscriptionId: id, toStatus: 'grace_period' },
    });
    expect(ev?.reason).toBe('period_ended');
  });

  it('grace_period + grace elapsed -> expired', async () => {
    const { sellerId } = await makeSeller();
    const id = await mkSub(sellerId, {
      status: 'grace_period',
      currentPeriodEnd: new Date('2020-05-01T00:00:00.000Z'),
      graceEndsAt: new Date('2020-05-08T00:00:00.000Z'),
    });
    await svc.sweepSubscriptionLifecycle(new Date('2020-05-09T00:00:00.000Z'));
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(sub.status).toBe('expired');
  });

  it('active + period ended + cancellation due -> cancelled (not grace)', async () => {
    const { sellerId } = await makeSeller();
    const periodEnd = new Date('2020-06-01T00:00:00.000Z');
    const id = await mkSub(sellerId, {
      status: 'active',
      currentPeriodEnd: periodEnd,
      cancelAt: periodEnd,
    });
    await svc.sweepSubscriptionLifecycle(new Date('2020-06-02T00:00:00.000Z'));
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(sub.status).toBe('cancelled');
  });

  it('active + period NOT ended -> unchanged; sweep is idempotent', async () => {
    const { sellerId } = await makeSeller();
    const id = await mkSub(sellerId, {
      status: 'active',
      currentPeriodEnd: new Date('2999-01-01T00:00:00.000Z'),
    });
    const first = await svc.sweepSubscriptionLifecycle(
      new Date('2020-01-01T00:00:00.000Z'),
    );
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(sub.status).toBe('active');
    // Re-running changes nothing further for this row.
    const second = await svc.sweepSubscriptionLifecycle(
      new Date('2020-01-01T00:00:00.000Z'),
    );
    expect(second.enteredGrace + second.cancelled + second.expired).toBe(
      first.enteredGrace + first.cancelled + first.expired - 0, // stable
    );
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { id } })).status,
    ).toBe('active');
  });

  it('scheduleCancellation sets cancelAt=periodEnd, keeps access, is idempotent', async () => {
    const { profileId, sellerId } = await makeSeller();
    const periodEnd = new Date(Date.now() + 30 * 86_400_000); // future
    const id = await mkSub(sellerId, {
      status: 'active',
      currentPeriodEnd: periodEnd,
    });

    const { cancelAt } = await svc.scheduleCancellation(profileId);
    expect(cancelAt.getTime()).toBe(periodEnd.getTime());

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(sub.status).toBe('active'); // access NOT revoked now
    expect(sub.cancelAt?.getTime()).toBe(periodEnd.getTime());
    expect(await svc.hasActiveSubscription(sellerId)).toBe(true); // still entitled

    // Idempotent: second call returns the same cancelAt, no duplicate schedule.
    const again = await svc.scheduleCancellation(profileId);
    expect(again.cancelAt.getTime()).toBe(periodEnd.getTime());
    expect(
      await prisma.subscriptionEvent.count({
        where: { subscriptionId: id, reason: 'cancellation_scheduled' },
      }),
    ).toBe(1);
  });

  it('resumeSubscription clears a scheduled cancellation', async () => {
    const { profileId, sellerId } = await makeSeller();
    const periodEnd = new Date(Date.now() + 30 * 86_400_000);
    const id = await mkSub(sellerId, {
      status: 'active',
      currentPeriodEnd: periodEnd,
      cancelAt: periodEnd,
    });
    await svc.resumeSubscription(profileId);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id } });
    expect(sub.cancelAt).toBeNull();
    expect(sub.status).toBe('active');
  });

  it('an expired subscription does not entitle', async () => {
    const { sellerId } = await makeSeller();
    await mkSub(sellerId, {
      status: 'expired',
      currentPeriodEnd: new Date('2020-02-01T00:00:00.000Z'),
    });
    expect(await svc.hasActiveSubscription(sellerId)).toBe(false);
  });
});

describe('listActiveSubscriptionPlans (P1.6 pricing)', () => {
  it('returns active plans cheapest-first with id + public price fields', async () => {
    const plans = await svc.listActiveSubscriptionPlans();
    expect(plans.length).toBeGreaterThanOrEqual(1);
    // Sorted by price ascending.
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i]!.priceMinor).toBeGreaterThanOrEqual(
        plans[i - 1]!.priceMinor,
      );
    }
    const p = plans[0]!;
    expect(typeof p.id).toBe('string');
    expect(typeof p.name).toBe('string');
    expect(typeof p.priceMinor).toBe('number');
    expect(p.currency).toHaveLength(3);
    expect(p.termDays).toBeGreaterThan(0);
    expect(p.weeklyListingQuota).toBeGreaterThanOrEqual(0);
  });

  it('excludes inactive plans', async () => {
    await prisma.subscriptionPlan.create({
      data: {
        code: `inactive-${Date.now()}`,
        name: 'Inactive Plan',
        priceMinor: 999999,
        currency: 'MKD',
        termDays: 30,
        weeklyListingQuota: 1,
        isActive: false,
      },
    });
    const plans = await svc.listActiveSubscriptionPlans();
    expect(plans.some((p) => p.name === 'Inactive Plan')).toBe(false);
  });
});
