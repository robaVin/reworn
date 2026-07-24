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
