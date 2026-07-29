# ReWorn — Subscriptions & Entitlement (Increment 4A)

The subscription domain is the **single source of truth** for a seller's plan,
lifecycle state, and entitlement. Checkout, webhook processing, storefront
publishing limits, and seller authorization all read through this module —
nothing re-queries the subscription tables directly.

**Stripe is not integrated in 4A.** This increment is the domain model, service,
lifecycle, entitlement resolution, and feature-gating only — the operations a
later checkout/webhook increment will call. No checkout, Elements, portal,
billing UI, or webhooks exist yet.

Business model: buyers are free; a **seller pays a subscription to publish
listings**. The only platform payment is this subscription — never a garment
purchase.

## Entities (already migrated in Stage 1)

`subscription_plans` (code / name / price minor+ISO / term days / weekly listing
quota / active), `subscriptions` (status + period window + grace + cancelAt +
isTrial), `subscription_events` (immutable, append-only audit of every
transition), `payment_attempts`, `payment_events`. 4A adds **no new entities** —
only the service, lifecycle, entitlement, feature-gating, and one idempotency
index (below).

## Lifecycle state machine (`subscription-status.ts`)

Pure and authoritative. Statuses: `pending → active → grace_period`, with
`expired`, `cancelled`, `suspended`. Legal transitions:

| action | from → to |
|---|---|
| `activate` | pending → active |
| `enter_grace` | active → grace_period |
| `recover` | grace_period → active |
| `expire` | active / grace_period → expired |
| `cancel` | pending / active / grace_period → cancelled |
| `suspend` | active / grace_period → suspended |
| `reinstate` | suspended → active |

`expired` and `cancelled` are terminal — a seller re-subscribes by creating a NEW
row. `applySubscriptionTransition` throws `InvalidSubscriptionTransitionError`
(409) on any illegal move.

**Entitlement predicate** `isEntitling(sub, now)` = a live status (active /
grace_period) **and** still within its effective window (grace end, else period
end). It is **sweep-resilient**: a live row whose window has already elapsed does
not entitle, even before a lifecycle cron moves it to `expired`.

## Service (`subscription-service.ts`)

The single read/write authority. Writes use the privileged connection and are
**system-driven** (activation/expiry come from verified payments and the sweep,
not a user request), so they carry no per-user auth — integrity is guaranteed by
the state machine and the partial-unique backstops. Every status change writes an
**immutable `subscription_events` row in the same transaction** as the update.

- **Queries:** `getLiveSubscription` (the single active/grace row, memoized),
  `getLatestSubscription`, `hasActiveSubscription` (live **and** entitling).
- **Entitlement:** `resolveSellerEntitlement(sellerId, sellerStatus, now)` →
  `SellerEntitlement` (enforced flag, hasActiveSubscription, status, plan,
  period end, canPublishListings, weeklyListingQuota).
- **Owner read:** `getSubscriptionForUser(userId)` → the caller's own
  `SellerSubscriptionDTO` (owner-scoped by construction).
- **Lifecycle ops** (called later by checkout/webhooks):
  `createPendingSubscription` (idempotent), `activateSubscription`,
  `transitionSubscription`.

### Idempotency & concurrency

- **`createPendingSubscription`** is idempotent and race-safe via the new
  **`ux_one_pending_subscription_per_seller`** partial unique (migration 0016):
  two concurrent initiations cannot both create a pending row — the loser hits
  the unique index and the existing pending subscription is returned. No
  find-then-insert.
- **Activation** is guarded by the Stage-1 **`ux_one_live_subscription_per_seller`**
  partial unique: activating a second subscription while one is live rolls the
  transaction back and raises `SubscriptionConflictError`. The two partial indexes
  cover disjoint status sets, so a seller may hold a live subscription **and** one
  pending (queued renewal) at once.

## Feature-gating (`feature-gating.ts`)

Pure. Turns entitlement facts into concrete access — the single home for the
rules, so call sites cannot diverge:

- `canPublish({ sellerStatus, enforced, hasActiveSubscription })` — active seller
  **and** (enforcement off **or** a live subscription).
- `resolveFeatureAccess(...)` → `{ canPublishListings, weeklyListingQuota }`
  (quota is 0 when publishing is gated off).
- `canUse(access, feature)` — named-feature gate (`publish_listing` today).

**Enforcement modes** (env `SUBSCRIPTION_ENFORCEMENT`): `true` (production
default, forced by env validation) requires a live subscription to publish;
`false` (dev bridge, forbidden in production) lets an active seller publish
without one so the flow is testable before checkout ships.

## Single-source integration

The catalog **already delegates** to this domain:

- `listing-service` publishing reads `hasActiveSubscription()` from the
  subscription service (not a local query).
- `catalog/entitlement.canPublishListing` delegates to the subscription
  feature-gate. A parity unit test asserts the two agree across the whole input
  space, so listing and subscription code can never disagree about "may publish".

## DTO privacy

`SellerSubscriptionDTO` and `SellerEntitlement` expose only status, plan summary
(code / name / quota), period end, cancelAt, and isTrial. They **never** carry
seller/subscription/plan row ids, payment-attempt ids, merchant/provider
references, or event snapshots (asserted).

## Authorization & RLS

Seller-facing reads are owner-scoped in the service and backstopped by RLS
(migration 0004: a seller reads only their own subscriptions; no user write
grants). System lifecycle writes go through the privileged service.

## Explicitly deferred

Stripe integration (Checkout / Elements / customer portal / webhooks), the
billing UI, invoices/receipts, proration, plan changes, the lifecycle cron
(expiry/grace sweep runner), dunning, and tax. 4A is the domain those will build
on.
