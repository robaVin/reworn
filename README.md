# ReWorn

A **second-hand fashion classifieds marketplace**. Buyers browse and contact
sellers directly; sellers pay a subscription to publish listings. **ReWorn never
processes garment purchases** — no cart, checkout, order, payout, escrow, or
platform shipping. The only platform payment is the seller's subscription.

Canonical documentation lives in [`docs/`](docs/) — the **repository is the
source of truth** (see [`docs/README.md`](docs/README.md)). Buyer↔seller
**messaging** has a secure backend (domain, RLS, service, tests) as of Increment
3A, a **conversation-creation Server Action** on the listing page (3B-A), an
authenticated **inbox** at `/messages` (3B-B), and and a **conversation thread + composer** at `/messages/[conversationId]`
(3B-C/3B-D) with idempotent sending — see
[`docs/MESSAGING.md`](docs/MESSAGING.md). **Real-time delivery** (and read
receipts, unread counts, notifications, attachments) is deferred to later
increments.

## Requirements

- **Node 20.9 or later** (enforced by the `preinstall` guard in
  `scripts/check-node.mjs`; `sharp` and `@supabase/supabase-js` require it). CI
  and production both run Node 20. Older Node is unsupported for acceptance or
  deployment.
- PostgreSQL (Supabase) + a **private** Supabase Storage bucket named
  `listing-images`.

## Quick start

```bash
npm ci                     # installs deps (preinstall enforces Node >= 20.9)
npm run db:generate        # generate the Prisma client
npm run db:migrate:deploy  # apply all migrations (see below)
npm run db:seed            # roles, subscription plans, categories
npm run dev                # http://localhost:3000
```

Copy `.env.example` to `.env` and fill in the Supabase URL/keys and the DB
connection strings before running migrations.

## Verification gate

```bash
npm run format:check && npm run lint && npm run typecheck && \
npm test && npm run build && npm audit --audit-level=high
```

CI (`.github/workflows/ci.yml`) runs exactly this on Node 20.

## Deployment

1. **Node 20.9+** on the target (Vercel/container).
2. Apply migrations: `npm run db:migrate:deploy` (forward-only; uses
   `DIRECT_URL`). **Migrations `0011` and `0012` are required** for the public
   marketplace — `/browse` search/filter/sort and `/shop/[handle]` fail without
   the `search_vector` column and the seller `handle`. Migrations **`0013`–`0015`** add
   the messaging tables (buyer↔seller conversations, Increment 3A), their
   listing-lifecycle hardening, and the compose idempotency token. Treat a
   missing migration as a **deployment failure** even though `error.tsx` renders
   cleanly.
3. Create the private `listing-images` Storage bucket (one-time).
4. Set env: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
   `DIRECT_URL`. `next/image` is restricted to the exact Supabase host + signed
   object path derived from `NEXT_PUBLIC_SUPABASE_URL`.
5. `npm run build && npm run start`.

### Database connection: session vs transaction pooler

> These are **observations for this project/environment, not universal
> guarantees.**

Measured on this project (see `npm run perf:rtt` / `npm run perf:probe`): a raw
`SELECT 1` is ~60 ms on **both** Supabase endpoints, but **Prisma** queries run
~5× slower through the **transaction pooler** (`:6543`, `pgbouncer=true`) than
through the **session pooler** (`:5432`) — pgbouncer transaction mode disables
prepared statements, so Prisma pays extra round-trips per query.

- **Local / long-lived application server:** the **session pooler (`:5432`)** is
  appropriate and was measured ~5× faster with Prisma.
- **Serverless / horizontally autoscaling:** keep the **transaction pooler
  (`:6543`, `pgbouncer=true`)** — it is required for many ephemeral connections
  (or use Prisma Accelerate); accept the per-query overhead there.

`DIRECT_URL` (session pooler `:5432`) is always used for migrations.

## Operational commands

- `npm run storage:reconcile-listing-images` — dry-run orphan reconciliation
  (`-- --delete` to remove; age-thresholded, safe logging).
- `npm run storage:verify-listing-images` — live private-bucket round-trip check.
- `npm run perf:probe` / `perf:rtt` / `perf:explain` — latency + query-plan probes.
