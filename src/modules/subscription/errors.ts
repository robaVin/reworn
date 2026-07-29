/**
 * Subscription-domain errors. Lifecycle-transition validity uses
 * {@link InvalidSubscriptionTransitionError} (in `subscription-status.ts`);
 * these cover the service's own failures. No raw Prisma/SQL detail is carried.
 */

/** A referenced subscription does not exist (404). */
export class SubscriptionNotFoundError extends Error {
  readonly status = 404 as const;
  constructor() {
    super('subscription_not_found');
    this.name = 'SubscriptionNotFoundError';
  }
}

/**
 * A state conflict — e.g. activating a subscription for a seller who already
 * holds a live one (the `ux_one_live_subscription_per_seller` backstop), or a
 * concurrent duplicate that lost the race (409).
 */
export class SubscriptionConflictError extends Error {
  readonly status = 409 as const;
  constructor(readonly reason: string) {
    super(`subscription_conflict:${reason}`);
    this.name = 'SubscriptionConflictError';
  }
}
