/**
 * Listing lifecycle state machine (pure, dependency-free, unit-tested).
 *
 * Mirrors the Prisma `ListingStatus` enum. There is exactly one place where
 * legal transitions are defined, so the listing service and (later) the UI
 * cannot disagree about what is allowed.
 *
 *   draft ──publish──▶ published ──pause──▶ paused
 *     │                   │  ▲                │
 *     │            markSold│  │markAvailable  │markSold
 *     │                   ▼  │                ▼
 *     │                   sold ◀──markSold────┘
 *     └──archive──▶ archived ◀──archive──(draft/published/paused/sold)
 *                     │
 *                relist│  (archived → draft)
 *                     ▼
 *                   draft        paused ──republish──▶ published
 *
 * `sold` is a SELLER-DECLARED state: the owner marks the item no longer
 * available. It is NOT a processed transaction — Galerija never brokers the
 * sale. `markAvailable` (sold → published) re-enters the public catalogue and
 * therefore re-runs the SAME publish entitlement/completeness gate as publish/
 * republish (enforced in the listing service), and the service clears soldAt.
 */

export const LISTING_STATUSES = [
  'draft',
  'published',
  'paused',
  'sold',
  'archived',
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type ListingTransition =
  | 'publish'
  | 'pause'
  | 'republish'
  | 'archive'
  | 'relist'
  | 'markSold'
  | 'markAvailable';

/** from → (action → to). The single source of truth for legal transitions. */
const TRANSITIONS: Record<
  ListingStatus,
  Partial<Record<ListingTransition, ListingStatus>>
> = {
  draft: { publish: 'published', archive: 'archived' },
  published: { pause: 'paused', markSold: 'sold', archive: 'archived' },
  paused: { republish: 'published', markSold: 'sold', archive: 'archived' },
  sold: { markAvailable: 'published', archive: 'archived' },
  archived: { relist: 'draft' },
};

export function isListingStatus(value: unknown): value is ListingStatus {
  return (
    typeof value === 'string' &&
    (LISTING_STATUSES as readonly string[]).includes(value)
  );
}

export function canApply(
  from: ListingStatus,
  action: ListingTransition,
): boolean {
  return TRANSITIONS[from][action] !== undefined;
}

export class InvalidListingTransitionError extends Error {
  constructor(
    readonly from: ListingStatus,
    readonly action: ListingTransition,
  ) {
    super(`invalid_listing_transition:${from}:${action}`);
    this.name = 'InvalidListingTransitionError';
  }
}

/** Returns the resulting status, or throws if the transition is illegal. */
export function applyTransition(
  from: ListingStatus,
  action: ListingTransition,
): ListingStatus {
  const to = TRANSITIONS[from][action];
  if (!to) throw new InvalidListingTransitionError(from, action);
  return to;
}

/** The transitions currently available from a status (for UI affordances). */
export function availableTransitions(from: ListingStatus): ListingTransition[] {
  return Object.keys(TRANSITIONS[from]) as ListingTransition[];
}

/** A listing is publicly visible only when published. */
export function isPubliclyVisible(status: ListingStatus): boolean {
  return status === 'published';
}

/** Fields may be edited only before/while unpublished-editable states. */
export function isEditable(status: ListingStatus): boolean {
  return status === 'draft' || status === 'paused';
}
