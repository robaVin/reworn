# ReWorn — Security Model (as implemented)

## Trust boundaries

- **Browser** — renders UI, holds the session cookie, initiates requests. Never
  trusted for identity, authorization, or any amount/plan/id claim.
- **Backend (service role / Prisma)** — the authority: computes values, runs
  state transitions, performs privileged writes, makes authorization decisions.
- **Supabase Auth** — authenticates identity, issues/rotates JWTs, owns
  credentials/OAuth. Not the business-authorization authority.
- **Postgres RLS** — deny-by-default backstop for the anon/authenticated
  (user-scoped) path. The service-role path bypasses RLS by design, so server
  code using it must do explicit ownership/role checks.

## Controls in place (verified by tests where noted)

| Control | Implementation |
|---|---|
| Identity | `supabase.auth.getUser()` only; no client-supplied id path (unit-tested) |
| RBAC | `modules/auth` pure decisions + guards; roles buyer/seller/admin (unit + RLS integration tests) |
| IDOR | ownership check returns **404** to hide existence (unit-tested) |
| RLS | deny-by-default + scoped policies; portable JWT-claim helpers; verified on real Postgres (19 integration tests) |
| Service-role isolation | `server-only` + ESLint import ban + static scan test |
| CSRF | Origin/Referer verification on unsafe methods (unit-tested) |
| CSP | nonce-based, no wildcard sources; Supabase + Sentry origins from config (unit-tested) |
| Security headers | HSTS (prod), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy |
| XSS | React escaping, `react/no-danger` rule, nonce CSP |
| SQL injection | Prisma parameterised; `$queryRawUnsafe`/`$executeRawUnsafe` ESLint-banned |
| Rate limiting | sliding-window middleware on `/api/auth`,`/api/payments`,`/auth` (in-memory) |
| Open redirects | `safe-redirect` internal-path allowlist (unit-tested) |
| Account enumeration | register + forgot-password return identical responses |
| Password recovery | update requires a server-verified session; no client tokens |
| OAuth | server-initiated redirect; truthful errors; no client secrets |
| Payment idempotency | DB-enforced (unique merchant ref, partial-unique provider refs, one-live-sub-per-seller) |
| Immutable audit/financial events | UPDATE-blocking triggers (verified) |
| Secrets | `.env*` git-ignored except `.env.example`; env validated at boot; logs redacted (tested) |
| Production mock prevention | env invariant refuses `PAYMENT_PROVIDER=mock` in production (tested) |

## Known limitations / deferred

- **Rate limiter** is in-memory/per-instance (best-effort on serverless);
  a distributed store is deferred until there is traffic justification.
- **GDPR export/erasure** workflows are labeled as future in the account UI;
  not yet implemented.
- **Live Supabase E2E** (real OAuth/email round-trip, on-the-wire cookie flags)
  is unverified pending credentials; logic is covered by unit + real-Postgres
  RLS tests.
- **File-upload validation** (EXIF strip, MIME/magic-byte, size/dimension) will
  land with the listings image feature.

## Current findings

- None open. The Next.js HIGH advisory (SSRF/DoS/cache-confusion set) was
  remediated by upgrading to the patched 15.5.x; `npm audit` reports 0
  vulnerabilities and CI fails on any high/critical.
