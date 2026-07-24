# ReWorn — Architecture (as implemented)

Verified from the codebase at the current HEAD. Updated per increment.

## Stack

- **Next.js 15 (App Router)** + **React 19** + **TypeScript (strict)**.
- **Tailwind CSS 3** with the **Sustainable** design tokens (`tailwind.config.ts`,
  `globals.css`). Server Components by default; Client Components only where
  interaction requires them.
- **PostgreSQL** via **Prisma** (schema + forward-only SQL migrations).
- **Supabase**: Auth (sole authentication authority), Postgres host, and — later —
  Storage. Row-Level Security is deny-by-default.
- **Deployment target:** Vercel (app) + Supabase (DB/Auth/Storage) + Render (n8n,
  later). **Node 20** (`.nvmrc`, `engines`, and a `preinstall` guard in
  `scripts/check-node.mjs` that fails a fresh install on Node < 20).

### Node version (required: 20+)

Node 18 is End-of-Life and unsupported (`@supabase/supabase-js` drops it). A
fresh `npm install` on Node < 20 fails with upgrade instructions. To upgrade on
Windows (recommended, nvm-windows):

```powershell
# install nvm-windows from https://github.com/coreybutler/nvm-windows/releases
nvm install 20
nvm use 20
node -v   # v20.x
```

Or install the Node 20 LTS MSI from https://nodejs.org/en/download. CI runs the
full gate on Node 20 (`.github/workflows/ci.yml`, `node-version-file: .nvmrc`).

## Module layout

```
src/
  app/                 App Router routes
    (auth)/            login, register, verify-email, forgot/reset-password
    (account)/         buyer account (guarded)
    (seller)/          seller area: dashboard, listings, subscription (guarded)
    (admin)/           admin area (guarded, hidden as 404 to non-admins)
    api/auth/*         register, login, logout, callback, oauth/google,
                       forgot-password, resend-verification, update-password
    browse|saved|messages|sell  public + shell pages
  components/
    ui/                design-system primitives (Button, Field, Alert, Card, …)
    shell/             header, mobile nav, footer, nav-model (RBAC-driven)
    home/  marketplace/  editorial + listing-card components
  lib/
    supabase/          browser | server (user-scoped) | admin (privileged) |
                       middleware (session refresh) | config (truthful gating)
    security/          headers+CSP | csrf | rate-limit
    db.ts env.ts logger.ts safe-redirect.ts cn.ts format.ts
  modules/
    auth/              roles, authorization (pure), guards, page-guards,
                       session, provisioning, role-service, schemas, http, errors
    catalog/           types (ListingCardData) — full domain arrives with listings
```

Business logic lives in `src/modules/*` with clear boundaries (modular monolith,
no microservices).

## Authentication & session flow

1. **Middleware** (`src/middleware.ts`) runs on every matched request: CSRF
   origin check → rate limit on sensitive paths → **Supabase session refresh**
   (token rotation, cookies written to the response) → security headers + a
   **nonce-based CSP** (the nonce is also placed on request headers so Next can
   stamp its own scripts — required for hydration under a strict CSP).
2. **Identity** always comes from `supabase.auth.getUser()` (server-verified),
   never from a decoded cookie or client input.
3. **Roles** are loaded via the **user-scoped** Supabase client (RLS applies),
   assembled into an `AuthContext` by `modules/auth/session.ts`.
4. **Guards** (`modules/auth/guards.ts`, `page-guards.ts`) apply pure decisions
   from `authorization.ts` and either throw (`AuthorizationError` → HTTP
   401/403/404 via `http.ts`) or navigate (redirect to `/login` on 401,
   `notFound()` on 403/404). Every protected route re-verifies independently;
   middleware is convenience, not authorization.

## Supabase client separation (security-critical)

| Client | Key | Use |
|---|---|---|
| `lib/supabase/browser.ts` | anon (public) | presentation-safe browser ops |
| `lib/supabase/server.ts` (user-scoped) | anon + session | **default** user-facing server access; RLS enforced |
| `lib/supabase/admin.ts` (privileged) | **service role** | narrow, audited server ops only; `server-only`, ESLint-banned from client, gated behind `getPrivilegedClient()` |

The privileged client bypasses RLS, so server code that uses it must perform its
own ownership/role checks. Ordinary user access uses the user-scoped client so
RLS actively protects the common path.

## Object storage — listing images (Increment 2C)

Listing photos are stored in a **private** Supabase Storage bucket
(`listing-images`), reached only through the privileged client from the
server-authoritative image service (`modules/catalog/image-service.ts`). The
`StorageAdapter` interface (`modules/catalog/storage.ts`) isolates Storage so
tests inject an in-memory fake; the sharp-backed processor is likewise seamed.
Pipeline: signature validation → sharp re-encode (EXIF strip, orientation
normalise, resize ≤1600px, WebP) → **storage upload then DB row**, with
storage-cleanup compensation if the DB write fails (no orphans, retry-safe).
Browsers receive short-lived **signed URLs**, never public object paths. `sharp`
is imported lazily so `next build` never loads the native binary. One-time setup:
create the `listing-images` bucket as **private** (no extra env var — it reuses
the existing service-role key).

## Truthful configuration gating

`lib/supabase/config.ts#isSupabaseConfigured()` detects missing/placeholder
Supabase env. UI uses it to render honest logged-out / "authentication not
configured" states rather than pretending a backend exists. It grants nothing.

## Listing entitlement — temporary development bridge

`modules/catalog/entitlement.ts` is the **single, server-authoritative** gate
for creating/publishing listings. It is a **pure** function taking an explicit
`ListingEntitlementInput` — no request/browser state can influence it.

Behaviour is controlled by the server env var **`SUBSCRIPTION_ENFORCEMENT`**
(default `true`):

- **`true` (production default):** publishing requires an active subscription.
  Because the bank gateway is not connected, no one has a subscription, so `/sell`
  shows a truthful *"subscription required / payment setup unavailable"* state and
  publishing is refused with `subscription_required`.
- **`false` (development bridge, non-production only):** an active seller may
  publish without a subscription, so the workflow is testable now. This value is
  **refused in production** by environment validation (`src/lib/env.ts` — the app
  fails to start). It is evaluated only on the server.

The service (`listing-service.ts`) assembles the entitlement input from
`env.SUBSCRIPTION_ENFORCEMENT` plus the seller's real subscription state (a DB
query — no fabricated rows). Draft creation only ever needs an active seller.
Increment 7 replaces the subscription-state source with the real subscription
service **without changing listing-service APIs or the entitlement contract**.

This is a deliberate, temporary bridge so the listing domain is usable before the
subscription domain exists. It does **not**:

- claim subscription enforcement exists,
- show fake subscription success, or
- create fake payment records.

There is **no client-side entitlement gate** — the browser form calls server
actions, and the server (service + this module) is authoritative. The
create-listing UI shows a truthful "Development entitlement" notice stating that
subscription/quota are not yet enforced.

**Production deployment note:** because subscription enforcement is not yet
active, any active seller can publish. Until Increment 7 ships, a production
deployment that wants listings gated by payment must not open seller
registration, OR must keep seller-profile creation an operator action. See
[ROADMAP.md](ROADMAP.md) increment 7.

## Development seller provisioning

Seller onboarding is not yet an in-app workflow. For development only, three
server-side scripts provision access against the dev database (they refuse to
run with `NODE_ENV=production`, use privileged APIs, are idempotent, log safely,
and are not reachable from the browser):

```bash
npm run dev:seller:provision -- --email you@example.com   # seller role + active seller profile
npm run dev:role:grant       -- --email you@example.com --role admin
npm run dev:user:create      -- --email you@example.com --password "Secret123"
```

Passwords are never committed — they come from a flag or the `DEV_PASSWORD` env
var at runtime. Long term this becomes an application workflow, not a script.

## Not yet implemented (tracked in ROADMAP)

Saved items, recently viewed, messaging, subscription state machine +
entitlement, payment abstraction module, admin operations, notifications,
reviews, PWA, monitoring. UI shells for seller/admin areas are deliberately
truthful placeholders. (Listings/catalog domain and listing-image storage are
implemented — Increments 2A–2C.)
