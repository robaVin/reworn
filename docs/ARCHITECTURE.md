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
  later). **Node 20** (`.nvmrc`, `engines`).

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

## Truthful configuration gating

`lib/supabase/config.ts#isSupabaseConfigured()` detects missing/placeholder
Supabase env. UI uses it to render honest logged-out / "authentication not
configured" states rather than pretending a backend exists. It grants nothing.

## Not yet implemented (tracked in ROADMAP)

Listings/catalog domain, image storage, saved items, recently viewed, messaging,
subscription state machine + entitlement, payment abstraction module, admin
operations, notifications, reviews, PWA, monitoring. UI shells for seller/admin
areas are deliberately truthful placeholders.
