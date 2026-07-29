import type { Subscription, SubscriptionStatus } from '@prisma/client';

/**
 * Subscription lifecycle state machine — the SINGLE authority for which status
 * transitions are legal, and for whether a subscription currently entitles a
 * seller. Pure (no DB, no env, no request access): the service assembles facts
 * and calls these functions; nothing here reads client-influenced state.
 *
 * Statuses (enum `subscription_status`):
 *   pending      — created, awaiting first activation (checkout is a later
 *                  increment; nothing activates a subscription in 4A).
 *   active       — paid and current; the "live" slot (with grace_period).
 *   grace_period — the paid period ended but a configurable grace window is open;
 *                  still entitling until it elapses.
 *   expired      — grace elapsed without renewal. Terminal.
 *   cancelled    — cancelled by the seller/admin. Terminal.
 *   suspended    — administratively held; not entitling; can be reinstated.
 *
 * A seller re-subscribes by creating a NEW subscription row; expired/cancelled
 * rows are never revived.
 */

/** Named transitions → the statuses they may start from and the status they reach. */
export const SUBSCRIPTION_TRANSITIONS = {
  activate: { from: ['pending'], to: 'active' },
  enter_grace: { from: ['active'], to: 'grace_period' },
  recover: { from: ['grace_period'], to: 'active' },
  expire: { from: ['active', 'grace_period'], to: 'expired' },
  cancel: { from: ['pending', 'active', 'grace_period'], to: 'cancelled' },
  suspend: { from: ['active', 'grace_period'], to: 'suspended' },
  reinstate: { from: ['suspended'], to: 'active' },
} satisfies Record<
  string,
  { from: readonly SubscriptionStatus[]; to: SubscriptionStatus }
>;

export type SubscriptionTransition = keyof typeof SUBSCRIPTION_TRANSITIONS;

/** An illegal lifecycle transition was requested (409). */
export class InvalidSubscriptionTransitionError extends Error {
  readonly status = 409 as const;
  constructor(
    readonly from: SubscriptionStatus,
    readonly action: SubscriptionTransition,
  ) {
    super(`invalid_subscription_transition:${from}:${action}`);
    this.name = 'InvalidSubscriptionTransitionError';
  }
}

/** Validate a transition and return the resulting status, or throw. */
export function applySubscriptionTransition(
  from: SubscriptionStatus,
  action: SubscriptionTransition,
): SubscriptionStatus {
  const t = SUBSCRIPTION_TRANSITIONS[action];
  const allowedFrom: readonly SubscriptionStatus[] = t.from;
  if (!allowedFrom.includes(from)) {
    throw new InvalidSubscriptionTransitionError(from, action);
  }
  return t.to;
}

/** The two statuses that occupy the single "live" slot per seller. */
export const LIVE_STATUSES = ['active', 'grace_period'] as const;

export function isLiveStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'grace_period';
}

type PeriodFields = Pick<Subscription, 'currentPeriodEnd' | 'graceEndsAt'>;

/** The instant a subscription stops entitling: the grace end if set, else the
 * paid-period end. Null means open-ended (no end recorded yet). */
export function effectiveEnd(sub: PeriodFields): Date | null {
  return sub.graceEndsAt ?? sub.currentPeriodEnd ?? null;
}

/**
 * Whether a subscription currently ENTITLES the seller. Resilient to a lagging
 * lifecycle sweep: a live-status row whose effective end has already passed does
 * NOT entitle, even if a cron has not yet moved it to expired.
 */
export function isEntitling(
  sub: PeriodFields & { status: SubscriptionStatus },
  now: Date,
): boolean {
  if (!isLiveStatus(sub.status)) return false;
  const end = effectiveEnd(sub);
  return end === null || now <= end;
}

/** The paid period has ended (grace may or may not still be open). */
export function hasPeriodEnded(sub: PeriodFields, now: Date): boolean {
  return sub.currentPeriodEnd !== null && now > sub.currentPeriodEnd;
}

/** The grace window has elapsed (the row is due to be expired). */
export function hasGraceEnded(sub: PeriodFields, now: Date): boolean {
  return sub.graceEndsAt !== null && now > sub.graceEndsAt;
}
