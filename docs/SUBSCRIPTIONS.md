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

### Idempotency, plan-correctness & concurrency

**`createPendingSubscription(sellerId, planId)`** always returns a pending
subscription **for the requested plan**:

- existing pending, **same plan** → reuse it;
- existing pending, **different plan** → atomically **supersede** the old pending
  (`pending → cancelled` with an immutable `superseded_by_plan_change` event) and
  create a fresh pending for the requested plan;
- no pending → create one.

It runs in **one transaction** that first takes a **per-seller advisory lock**
(`pg_advisory_xact_lock`, released at commit/rollback), so concurrent requests for
the same seller are fully serialized — no find-then-insert race and no ping-pong
on the `ux_one_pending_subscription_per_seller` unique (migration 0016).
Superseded rows are **never deleted**; they remain in history as `cancelled`.

**Concurrency winner policy:** *last committed wins.* Each caller receives a
subscription for its **own** requested plan (the returned row never has a
different plan). If two different plans are requested simultaneously, exactly one
pending row survives — the last transaction to commit — and the earlier one is
left `cancelled` in history with the superseded event.

**Activation** is guarded by the Stage-1 **`ux_one_live_subscription_per_seller`**
partial unique: activating a second subscription while one is live rolls the
transaction back and raises `SubscriptionConflictError`. The two partial indexes
cover disjoint status sets, so a seller may hold a live subscription **and** one
pending (queued renewal) at once.

### Provider-event idempotency (webhook replay protection)

The durable mechanism Increment **4C** will use to deduplicate repeated provider
webhook deliveries already exists in the schema: **`payment_events.provider_event_id`**
carries a global partial-unique index **`ux_payment_events_provider_event_id`**
(migration 0002). `recordProviderEventOnce` (`provider-events.ts`, **provider-
neutral** — no Stripe/CaSys logic, no handler) is the replay-safe primitive:

- provider event identity is **unique** (the DB index);
- a repeated delivery creates **no** duplicate `payment_events` row;
- the optional domain transition (`apply`) runs **in the same transaction** as the
  event insert, so a duplicate rolls **both** back — no duplicate domain
  transition and no duplicate `subscription_events` row;
- the processing result is **safely reusable**: a replay returns the already-
  stored event with `isReplay: true`.

No migration is needed — the schema already supports this. Tests prove the unique
constraint, the exactly-once transition, and the transactional rollback on replay.

## Feature-gating (`feature-gating.ts`)

Pure. Turns entitlement facts into concrete access — the single home for the
rules, so call sites cannot diverge:

- `canPublish({ sellerStatus, enforced, hasActiveSubscription })` — active seller
  **and** (enforcement off **or** a live subscription).
- `resolveFeatureAccess(...)` → `{ canPublishListings, weeklyListingQuota }`
  (quota is 0 when publishing is gated off).
- `canUse(access, feature)` — named-feature gate (`publish_listing` today).

**Enforcement modes** (env `SUBSCRIPTION_ENFORCEMENT`): see the rollout policy
below. Default **`false`** (disabled); `true` requires a live payment provider.

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

## Entitlement matrix

`isEntitling(sub, now)` — the single predicate behind `hasActiveSubscription`
and all publishing/authorization:

| status | entitles? |
|---|---|
| `pending` | no |
| `active` | **only inside** the effective window (`now ≤ period end`) |
| `grace_period` | **only inside** the grace window (`now ≤ grace end`) |
| `suspended` | no |
| `cancelled` | no |
| `expired` | no |

Boundary rules (tested): entitlement holds at `now == effectiveEnd` and is lost
at `effectiveEnd + 1 ms`. A **delayed lifecycle sweep cannot extend entitlement**
— a row still stamped `active`/`grace_period` whose window has elapsed does **not**
entitle. When entitlement is denied, the **plan quota is 0** (`resolveFeatureAccess`).

## Production rollout & runbook

**Policy A (approved): keep enforcement DISABLED until checkout, webhook
processing, and seller recovery paths are live.** Production currently has
existing published listings and **no** subscriptions (verified via aggregate,
non-identifying counts), so immediate hard enforcement would strand existing
sellers — it must stay off during the incomplete billing rollout.

`SUBSCRIPTION_ENFORCEMENT` now **defaults to `false`** and is permitted to be
`false` in **every** environment (including production). Enabling it
(`=true`) **requires a live `PAYMENT_PROVIDER`** (not `none`) — env validation
refuses `true` + `none` (fail closed), so enforcement literally cannot be turned
on until a real gateway is wired. An unknown value fails the build.

| environment | behavior |
|---|---|
| development | `false` (default) — active sellers publish without a subscription; `mock` provider allowed for testing |
| test | `false` (set in `tests/setup.ts`) |
| staging | `false` until a staging gateway is live; then `true` to rehearse enforcement |
| production | `false` (rollout) — existing sellers keep publishing; flip to `true` only after the activation checklist |

**Activation checklist (before setting `SUBSCRIPTION_ENFORCEMENT=true` in prod):**
1. a real `PAYMENT_PROVIDER` is implemented, configured, and verified (checkout
   creates a `pending` subscription; a verified webhook activates it);
2. webhook processing uses `recordProviderEventOnce` (replay-safe);
3. the lifecycle sweep (grace → expired) runs on a schedule;
4. a seller **recovery/renewal** path exists (a lapsed seller can re-subscribe);
5. sellers are notified ahead of enforcement.
Then set `SUBSCRIPTION_ENFORCEMENT=true` in the production environment.

**Rollback:** set `SUBSCRIPTION_ENFORCEMENT=false` (or unset) and redeploy —
publishing is immediately un-gated again; no data changes are required.

**Entitlement loss & already-published listings:** losing entitlement blocks
**new** publish/republish transitions only. Already-`published` listings are
**never silently unpublished** by this domain — an explicit, seller-visible
lifecycle policy (with notice) would own any future takedown, and is out of scope
here.

## Checkout (Increment 4B)

Checkout **initiation** (4B) is built (see [PAYMENTS.md](PAYMENTS.md)): an active
seller starts a checkout for a plan, which calls `createPendingSubscription`
(reuse/supersede) and redirects to a provider session — creating a `pending`
subscription and a reconciliation `payment_attempt`. Checkout **never activates**
a subscription.

**Activation (4C)** happens **only** through webhook processing
(`POST /api/payments/webhook`): a verified, deduplicated `payment_succeeded`
event activates the pending subscription (`pending → active`) via
`activatePendingSubscriptionTx`, atomically with the payment-event insert, with an
immutable `payment_verified` lifecycle event. Processing is idempotent and
out-of-order safe (replay / late-failure / amount-mismatch / existing-live are all
handled without double-activation). No subscription is ever activated anywhere
else.

## Explicitly deferred

Stripe integration (Checkout / Elements / customer portal / webhooks), the
billing UI, invoices/receipts, proration, plan changes, the lifecycle cron
(expiry/grace sweep runner), dunning, and tax. 4A is the domain those will build
on.
