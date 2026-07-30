import 'server-only';

import { cache } from 'react';
import { Prisma, type Subscription } from '@prisma/client';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { timeSpan } from '@/lib/perf';
import {
  applySubscriptionTransition,
  isEntitling,
  type SubscriptionTransition,
} from './subscription-status';
import { resolveFeatureAccess } from './feature-gating';
import { SubscriptionConflictError, SubscriptionNotFoundError } from './errors';
import type {
  SellerEntitlement,
  SellerSubscriptionDTO,
  SubscriptionPlanSummary,
} from './dto';

/**
 * Subscription service — the SINGLE source of truth for a seller's subscription
 * state and entitlement. Checkout, webhook processing, storefront publishing
 * limits, and seller authorization all read through here; none re-query the
 * subscription tables directly.
 *
 * WRITES go through the privileged Prisma connection and are SYSTEM-driven
 * (activation/expiry are triggered by verified payments and the lifecycle
 * sweep, not by a user request), so they carry no per-user authorization — the
 * one-live / one-pending partial uniques and the state machine are the
 * integrity guarantees. Every status change records an IMMUTABLE
 * `subscription_events` row IN THE SAME TRANSACTION as the update. The seller-
 * facing READ (`getSubscriptionForUser`) is owner-scoped by construction.
 *
 * Stripe is NOT integrated in this increment; these are the domain operations
 * that a later checkout/webhook increment will call.
 */

const withPlan = {
  include: {
    plan: { select: { code: true, name: true, weeklyListingQuota: true } },
  },
} satisfies Prisma.SubscriptionDefaultArgs;

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<typeof withPlan>;

function planSummary(
  plan: SubscriptionWithPlan['plan'],
): SubscriptionPlanSummary {
  return {
    code: plan.code,
    name: plan.name,
    weeklyListingQuota: plan.weeklyListingQuota,
  };
}

/* -------------------------------- queries --------------------------------- */

/**
 * The seller's LIVE subscription (the single active/grace row), or null.
 * Request-memoized so the entitlement resolver and a DTO read in the same
 * request share one query.
 */
export const getLiveSubscription = cache(
  async (sellerId: string): Promise<SubscriptionWithPlan | null> => {
    return timeSpan('db.subscriptionLive', () =>
      prisma.subscription.findFirst({
        where: { sellerId, status: { in: ['active', 'grace_period'] } },
        ...withPlan,
      }),
    );
  },
);

/** The seller's most recently created subscription (any status), or null. */
export async function getLatestSubscription(
  sellerId: string,
): Promise<SubscriptionWithPlan | null> {
  return prisma.subscription.findFirst({
    where: { sellerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...withPlan,
  });
}

/**
 * Whether the seller currently holds an ENTITLING subscription. THE single fact
 * consumed by publishing/authorization. Robust to a lagging lifecycle sweep: a
 * live row whose grace-inclusive window has passed does not count.
 */
export async function hasActiveSubscription(
  sellerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const live = await getLiveSubscription(sellerId);
  return live !== null && isEntitling(live, now);
}

/* ------------------------- entitlement resolution ------------------------- */

/**
 * Resolve a seller's entitlement from real subscription state + the server
 * enforcement flag. The authoritative input to feature-gating. Request-memoized.
 */
export const resolveSellerEntitlement = cache(
  async (
    sellerId: string,
    sellerStatus: 'active' | 'frozen' | 'banned' = 'active',
    now: Date = new Date(),
  ): Promise<SellerEntitlement> => {
    const enforced = env.SUBSCRIPTION_ENFORCEMENT;
    const live = await getLiveSubscription(sellerId);
    const entitled = live !== null && isEntitling(live, now);
    const plan = entitled && live ? planSummary(live.plan) : null;

    const access = resolveFeatureAccess({
      sellerStatus,
      enforced,
      hasActiveSubscription: entitled,
      weeklyListingQuota: plan?.weeklyListingQuota ?? null,
    });

    return {
      enforced,
      hasActiveSubscription: entitled,
      status: entitled && live ? live.status : null,
      plan,
      currentPeriodEnd: entitled && live ? live.currentPeriodEnd : null,
      canPublishListings: access.canPublishListings,
      weeklyListingQuota: access.weeklyListingQuota,
    };
  },
);

/* ----------------------------- owner-scoped read -------------------------- */

/**
 * The current user's OWN subscription DTO (via their seller profile), or null
 * when they have no seller profile or no subscription. Owner-scoped by
 * construction — it only ever reads the caller's own seller. RLS is the
 * defence-in-depth backstop for any other path.
 */
export async function getSubscriptionForUser(
  userId: string,
): Promise<SellerSubscriptionDTO | null> {
  const seller = await prisma.sellerProfile.findUnique({
    where: { profileId: userId },
    select: { id: true },
  });
  if (!seller) return null;

  const sub =
    (await getLiveSubscription(seller.id)) ??
    (await getLatestSubscription(seller.id));
  if (!sub) return null;

  return {
    status: sub.status,
    plan: planSummary(sub.plan),
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAt: sub.cancelAt,
    isTrial: sub.isTrial,
  };
}

/* --------------------------- lifecycle operations ------------------------- */

/** Append an immutable lifecycle event within the caller's transaction. */
async function recordEvent(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  fromStatus: Subscription['status'] | null,
  toStatus: Subscription['status'],
  reason: string,
  opts: { snapshot?: Prisma.InputJsonValue; paymentAttemptId?: string } = {},
): Promise<void> {
  await tx.subscriptionEvent.create({
    data: {
      subscriptionId,
      fromStatus,
      toStatus,
      reason,
      ...(opts.snapshot !== undefined ? { snapshot: opts.snapshot } : {}),
      ...(opts.paymentAttemptId
        ? { paymentAttemptId: opts.paymentAttemptId }
        : {}),
    },
  });
}

/**
 * Get-or-create the seller's single PENDING subscription **for the requested
 * plan**. The returned subscription ALWAYS matches `planId`:
 *
 *   - existing pending, SAME plan      -> reuse it,
 *   - existing pending, DIFFERENT plan -> atomically supersede it (cancel +
 *     immutable `superseded_by_plan_change` event) and create a fresh pending
 *     for the requested plan,
 *   - no pending                       -> create one.
 *
 * All of this runs in ONE transaction that first takes a per-seller advisory
 * lock (`pg_advisory_xact_lock`, released at commit/rollback), so concurrent
 * requests for the same seller are fully serialized and deterministic — no
 * find-then-insert race and no ping-pong on the `ux_one_pending_subscription_per_seller`
 * unique. Superseded rows are never deleted; they remain in history as
 * `cancelled`. Concurrency winner policy: **last committed wins** — each caller
 * receives a subscription for its own requested plan, and if two different plans
 * are requested simultaneously the pending that ultimately survives is the last
 * transaction to commit (the earlier one is left cancelled in history).
 */
export async function createPendingSubscription(
  sellerId: string,
  planId: string,
): Promise<Subscription> {
  return prisma.$transaction(async (tx) => {
    // Serialize all pending-intent changes for this seller.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sellerId})::bigint)`;

    const existing = await tx.subscription.findFirst({
      where: { sellerId, status: 'pending' },
    });

    if (existing) {
      if (existing.planId === planId) return existing; // same plan -> reuse
      // Different plan: supersede the old pending (a valid pending -> cancelled
      // transition), then fall through to create the requested one.
      const superseded = applySubscriptionTransition(existing.status, 'cancel');
      await tx.subscription.update({
        where: { id: existing.id },
        data: { status: superseded },
      });
      await recordEvent(
        tx,
        existing.id,
        existing.status,
        superseded,
        'superseded_by_plan_change',
      );
    }

    const created = await tx.subscription.create({
      data: { sellerId, planId, status: 'pending' },
    });
    await recordEvent(tx, created.id, null, 'pending', 'created');
    return created;
  });
}

interface ActivationInput {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceEndsAt?: Date | null;
  paymentAttemptId?: string;
  reason?: string;
}

/**
 * Activate a pending subscription (pending → active), stamping its paid period.
 * Update + event commit atomically. If the seller already holds a live
 * subscription, the `ux_one_live_subscription_per_seller` backstop rolls the
 * transaction back and a {@link SubscriptionConflictError} is raised.
 */
export async function activateSubscription(
  subscriptionId: string,
  input: ActivationInput,
): Promise<Subscription> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new SubscriptionNotFoundError();
  const next = applySubscriptionTransition(sub.status, 'activate');

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: next,
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          graceEndsAt: input.graceEndsAt ?? null,
        },
      });
      await recordEvent(
        tx,
        subscriptionId,
        sub.status,
        next,
        input.reason ?? 'activated',
        {
          paymentAttemptId: input.paymentAttemptId,
        },
      );
      return updated;
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new SubscriptionConflictError('already_live');
    }
    throw e;
  }
}

interface TransitionInput {
  reason: string;
  snapshot?: Prisma.InputJsonValue;
  paymentAttemptId?: string;
  /** Optional lifecycle field updates applied alongside the status change. */
  patch?: Pick<
    Prisma.SubscriptionUncheckedUpdateInput,
    'currentPeriodStart' | 'currentPeriodEnd' | 'graceEndsAt' | 'cancelAt'
  >;
}

/**
 * Apply any validated lifecycle transition (enter_grace / recover / expire /
 * cancel / suspend / reinstate). Status update + immutable event commit
 * atomically. An illegal transition throws `InvalidSubscriptionTransitionError`;
 * a live-slot conflict throws `SubscriptionConflictError`.
 */
export async function transitionSubscription(
  subscriptionId: string,
  action: SubscriptionTransition,
  input: TransitionInput,
): Promise<Subscription> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
  });
  if (!sub) throw new SubscriptionNotFoundError();
  const next = applySubscriptionTransition(sub.status, action);

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: next, ...(input.patch ?? {}) },
      });
      await recordEvent(tx, subscriptionId, sub.status, next, input.reason, {
        snapshot: input.snapshot,
        paymentAttemptId: input.paymentAttemptId,
      });
      return updated;
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new SubscriptionConflictError('already_live');
    }
    throw e;
  }
}
