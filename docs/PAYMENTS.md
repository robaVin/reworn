# ReWorn — Payments (provider-independent; bank gateway blocked)

The **only** platform payment is the seller subscription. There is no garment
checkout, cart, payout, escrow, or refund-for-goods.

## Status

- **Live bank gateway: BLOCKED.** The likely provider is a Macedonian bank
  gateway (CaSys / CPay), but this is **not** confirmed for production. We do not
  implement live bank communication and **do not invent** endpoints, field names,
  signing algorithms, callback payloads, status values, headers, merchant
  identifiers, refund APIs, or recurring behaviour.
- **Provider-independent work: allowed now.** The database already enforces the
  payment-attempt/idempotency model (see [DATABASE.md](DATABASE.md)). The
  application-layer payment module (interface + mock + disabled adapter) is
  scheduled with the subscription increment.

## Design (provider-independent)

A `PaymentGateway` interface with operations along the lines of:
`createPaymentRequest`, `verifyCallback`, `getPaymentStatus?`, `createRefund?`,
`validateConfiguration`.

Two implementations:

1. **`MockPaymentGateway`** — development/test/staging only. It is impossible to
   enable in production: the environment invariant refuses
   `PAYMENT_PROVIDER=mock` when `NODE_ENV=production` (already enforced and
   unit-tested in `lib/env.ts`).
2. **`CasysPaymentGateway`** — a **disabled** integration boundary.
   `validateConfiguration()` reports not-configured and every method throws a
   clear configuration error. Selecting `casys` (or `CASYS_ENABLED=true`) fails
   environment validation until official documentation and credentials exist.

The application owns subscription lifecycle in its own `SubscriptionService`; the
gateway is only a "collect one payment" primitive. A verified server-side
callback updates exactly one `PaymentAttempt` (idempotent, DB-enforced). Browser
return parameters are never treated as proof of payment.

## Checkout initiation (Increment 4B — IMPLEMENTED)

The application-layer checkout flow is now built (provider-independent; only the
`mock` provider is wired — a real gateway remains blocked). Layering:

```
startCheckoutAction (Server Action)   auth · input · redirect · observability
        ↓
initiateCheckout (checkout service)   seller authz · plan · pending subscription
        ↓                             (4A reuse/replace) · idempotency
PaymentProvider (abstraction)         createCheckoutSession · validateConfiguration
        ↓
payment_attempts / subscriptions
```

- **`PaymentProvider`** (`src/modules/payment/provider.ts`) is the checkout-session
  abstraction: `createCheckoutSession(request) → { providerSessionId, checkoutUrl }`
  and `validateConfiguration()`. `MockPaymentProvider` is the only implementation;
  `getPaymentProvider()` **fails closed** (`PAYMENT_PROVIDER="none"` →
  `PaymentConfigError`, no silent fallback). No provider SDK leaks past an
  implementation. (This complements the planned `verifyCallback` primitive that
  webhook processing will use in 4C.)
- **Flow:** an **active seller** initiates checkout for a plan → the 4A
  `createPendingSubscription` reuses the same-plan pending or supersedes a
  different-plan one → an OPEN session is reused, else the provider creates one
  and a `payment_attempts` row is persisted (merchant ref, provider session id,
  non-secret `checkout_url`, bound `subscription_id`, amount/currency, expiry) →
  the seller is redirected to the provider URL. Amount/plan are **server-computed
  from the DB**.
- **Idempotency:** at most one open attempt per pending subscription
  (`ux_one_open_attempt_per_subscription`, migration 0017). Sequential repeats
  reuse the session; a different plan starts a new one; only a truly concurrent
  double-init may create a second provider session (unavoidable) but persists
  only one.
- **Boundary:** checkout **never activates** a subscription — it stays `pending`.
  Activation is exclusively webhook processing (4C), which deduplicates provider
  events via `payment_events.provider_event_id` (see
  [SUBSCRIPTIONS.md](SUBSCRIPTIONS.md)).
- **Privacy/errors:** failures map to safe kinds (`notSeller` / `sellerInactive`
  / `invalidPlan` / `providerUnavailable` / `providerError` / `unexpected`); raw
  provider errors, API keys, customer ids, and payloads never reach the client,
  DTOs, or logs. The DTO carries only `checkoutUrl`.

Still deferred to later increments: webhook handlers, activation, confirmation,
customer portal, billing history/invoices/refunds, plan changes, cancellations,
proration, retries, dunning, Stripe Elements, and the frontend billing UI (the
button that calls `startCheckoutAction`). The end-to-end paid flow completes when
webhook activation lands in 4C.

## Configuration expected later (from the bank)

Merchant credentials, gateway/sandbox credentials, official documentation,
callback specification, signing/verification rules, payment-request fields,
currency, merchant-reference format, refund capability, recurring capability,
production endpoints.

## Payment UI states (allowed now)

`pending`, `failed`, `cancelled`, `expired`, and **awaiting-configuration** — the
last shown truthfully wherever a real gateway is not configured, instead of any
simulated success.

## How the bank integration is inserted later

Implement `CasysPaymentGateway` against the **same** `PaymentGateway` interface
using the official spec; wire configuration variables; no redesign of the
subscription service, schema, or UI is required.
