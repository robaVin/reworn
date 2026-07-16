# ReWorn — System Architecture & Security-First Design
### Phases 3 & 4

> Scoped to the **classifieds + subscription + messaging** product defined in
> [`00-executive-summary-and-requirements.md`](00-executive-summary-and-requirements.md).
> Budget-appropriate: **buy managed infrastructure, don't build it.**

---

## Part A — System Architecture (Phase 3)

### A.0 Guiding principles

1. **Modular monolith, not microservices.** "Thousands of users" is small; a single
   deployable app with clean module boundaries is faster to build, cheaper to run, and
   easier for a tiny team to maintain. Microservices here would be resume-driven
   over-engineering.
2. **Managed platforms over bespoke.** Supabase (Postgres + Auth + Storage + RLS),
   Stripe (billing), n8n (automation), a managed host. Each replaces weeks of custom,
   security-sensitive work.
3. **Security by default via the platform**, not bolted on (RLS, hosted auth, hosted
   payments).
4. **Design the transactional seam now, build it in v2.** The architecture must not have
   to be rewritten to add on-platform payments later.

### A.1 High-level architecture

```
Browser / Installed PWA (Next.js, React, service worker)
        │  HTTPS
        ▼
Edge/CDN (static assets, images via transform CDN)
        │
        ▼
Application (Next.js server + API routes / Route Handlers)  ── modular monolith
   ├─ Auth module        → Supabase Auth (email, Google OAuth, phone OTP)
   ├─ Catalog module     → listings, categories, variants, search
   ├─ Messaging module   → conversations, messages, attachments
   ├─ Subscription module→ Stripe Billing (plans, webhooks)
   ├─ Notification module→ email + web push + in-app
   ├─ Moderation module  → reports, queue, admin actions
   └─ Analytics module   → listing/lead metrics
        │
        ├──────────────► PostgreSQL (Supabase) — single source of truth, RLS enforced
        ├──────────────► Object Storage + Image CDN (Supabase Storage / Cloudflare)
        ├──────────────► Stripe (subscription billing, webhooks)
        ├──────────────► n8n (async orchestration & business automations)
        └──────────────► Email provider (Postmark/Resend) & Web Push
```

### A.2 Frontend architecture

- **Next.js (App Router) + React + TypeScript**, delivered as a **PWA** (installable,
  offline shell via service worker, Web Push).
- **Why:** SSR/SSG for fast, SEO-friendly catalog pages (discovery matters for a
  marketplace); one codebase serves web + installable PWA; huge ecosystem; the earlier
  `preview.html` design (warm/simple, Earthy direction) ports directly.
- **State:** React Query/TanStack Query for server state; minimal client state.
- **Design system:** the "warm & simple" tokens from the concept work (cream/beige/
  terracotta/forest), componentised.
- **Alt considered:** SPA (CRA/Vite) — rejected: worse SEO for a discovery marketplace.
  Native apps — rejected: client chose PWA, and budget.

### A.3 Backend architecture

- **Next.js Route Handlers / a thin NestJS-style service layer** in the same repo
  (modular monolith). Business logic in service modules with clear boundaries so a module
  *could* be extracted later if ever needed.
- **Why monolith:** one deploy, one log stream, transactional integrity within one DB,
  minimal ops for a small team, fits budget. Scale vertically + read replicas long before
  needing to split.
- **Alt considered:** microservices — rejected (cost, complexity, no scale justification).

### A.4 API architecture

- **REST + JSON** over HTTPS, resource-oriented, versioned (`/api/v1`), cursor
  pagination, consistent error envelope.
- **Why REST over GraphQL:** simpler to secure and rate-limit, fewer footguns
  (over-fetch/DoS via nested queries), team familiarity, adequate for these access
  patterns. GraphQL's flexibility isn't needed here.
- **Webhooks in:** Stripe (subscription events) → verified by signature.
- **Webhooks/HTTP out:** app → n8n for automations (§ n8n doc).
- Full endpoint list in [`05-diagrams.md`](05-diagrams.md) API section.

### A.5 Authentication system

- **Supabase Auth**: email/password, **Google OAuth**, **phone OTP** (SMS) — exactly the
  three methods the client asked for.
- Issues JWT access tokens + rotating refresh tokens; sessions managed by the platform.
- **Why:** building auth (OAuth flows, OTP, secure password storage, session rotation) on
  a €2k budget is malpractice; Supabase Auth is battle-tested and integrates with RLS.

### A.6 Authorization system (RBAC)

- Roles: **buyer**, **seller**, **admin** (admin = admin+support). Stored in
  `user_roles`; encoded as a custom JWT claim.
- **Two enforcement layers:**
  1. **Application layer** — middleware guards per route (e.g. "create listing" requires
     `seller` + active subscription + within weekly quota).
  2. **Database layer** — **Postgres Row-Level Security (RLS)**: users read/write only
     their own rows; a seller can only mutate their own listings; messages visible only
     to participants. Defense-in-depth: even a compromised app layer can't bypass RLS.
- **Why RLS:** it's the single highest-leverage security control available on this stack —
  authorization enforced at the data layer, per-row, always on.

### A.7 File storage & media handling

- **Object storage** (Supabase Storage / S3-compatible) behind an **image transform CDN**
  (on-the-fly resize/format → WebP/AVIF, responsive `srcset`).
- **Upload flow:** client requests a **short-lived signed upload URL** → uploads directly
  to storage (app server never proxies bytes) → server validates and records metadata.
- **Validation (critical, user-generated images):** MIME + magic-byte sniffing (not just
  extension), max dimensions/size, **re-encode/strip EXIF** (removes GPS/PII and defuses
  polyglot payloads), optional malware/NSFW scan via n8n. See Security §B.11.
- **Why direct-to-storage:** cheap, scalable, keeps large uploads off the app tier.

### A.8 Messaging architecture

- 1:1 **conversations** scoped to a listing; `messages` + `message_attachments`.
- **MVP transport:** request/response + **short-polling or Supabase Realtime** (Postgres
  change feed) for near-real-time without running a bespoke WebSocket cluster.
- **Why:** client said no live-chat SLA; a "small notification button" suffices. Realtime
  via the managed platform avoids standing up socket infrastructure.
- Abuse controls baked in: per-user send rate limits, block/report, no auto-reveal of
  external contact info, moderation hooks.

### A.9 Notification system

- Channels: **in-app** (notification bell), **email** (transactional), **web push**
  (PWA). SMS optional/expensive → reserve for OTP only.
- **Fan-out via n8n:** app emits a domain event → n8n routes to the right channel(s) with
  retries and templating. Keeps notification logic out of the request path.

### A.10 Payment flow (subscriptions only)

- **Stripe Billing.** Seller picks a plan → Stripe Checkout / Payment Element (SCA/3DS) →
  Stripe stores the card (platform never touches PAN → **PCI SAQ-A**) → Stripe webhooks
  (`checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.deleted`) → app updates `subscriptions` state → unlocks/locks
  seller listing ability.
- Idempotent webhook handling; signature verified; dunning + grace period on failure.
- Full sequence diagram in [`05-diagrams.md`](05-diagrams.md).

### A.11 Order management — **N/A for MVP**

No on-platform orders (see reframing). The seller dashboard shows **listing & lead
analytics** (views, saves, buyer contacts), not financial orders. Order/OrderItem tables
exist in the ERD **only as v2 optional** for the transactional pivot.

### A.12 Inventory management

- Second-hand items are typically **unique (qty 1)**. Track per-listing `status`
  (`active` / `sold` / `hidden` / `expired`) and optional per-variant quantity.
- No checkout reservation logic (no checkout). Seller marks sold manually (or on a v2
  purchase).

### A.13 Subscription management

- `subscription_plans` (tier, price, weekly_listing_quota, features) ×
  `subscriptions` (seller, plan, status, period, Stripe IDs).
- **Weekly quota enforcement:** `listing_usage` counter per seller per ISO week, checked
  at listing-create time; reset weekly by an n8n scheduled job.
- On lapse: block new listings, hide existing (policy per ASM); restore on renewal.

### A.14 Search architecture

- **MVP:** **PostgreSQL full-text search** (`tsvector` + GIN) + trigram (`pg_trgm`) for
  fuzzy, with faceted filters (category, size, price, condition, gender) as SQL
  `WHERE`/indexes. **Zero extra infra.**
- **v2 (scale/relevance):** Typesense/Meilisearch (cheap, self-hostable) or Algolia
  (managed) if search quality/volume demands it.
- **Why start in Postgres:** the requested filter set is small and structured; a
  dedicated search engine is unjustified infra for MVP.

### A.15 Recommendation engine

- **v2.** MVP "similar products" = **content-based** SQL (same category + gender +
  overlapping tags + price band). No ML.
- **v2:** co-view / co-wishlist collaborative signals; only add ML if data volume warrants.

### A.16 Analytics

- **Product analytics:** listing views, saves, wishlist adds, buyer-contact (lead)
  events → aggregated for the seller dashboard and admin reports.
- **Behavioural:** privacy-respecting analytics (e.g. self-hosted Plausible/PostHog) —
  GDPR-friendly, no ad-tech.
- Event pipeline: app emits events → lightweight `events` table / queue → nightly n8n
  rollups into `listing_stats`.

### A.17 Audit logging

- Append-only `audit_logs` for security-sensitive actions (login, role change,
  subscription change, listing takedown, admin actions, data export/erasure). Immutable,
  retained per policy. See Security §B.20.

### A.18 Monitoring & observability

- **Error tracking:** Sentry (frontend + backend).
- **Uptime:** external monitor (Better Uptime / UptimeRobot) + status page.
- **Logs/metrics:** host-provided + structured JSON logs; Stripe & Supabase dashboards.
- **Alerting:** critical alerts → n8n → email/Slack.

### A.19 Caching

- CDN edge cache for static + images.
- HTTP cache headers + ISR/SSG for catalog/listing pages.
- Optional **Redis (managed)** for sessions/rate-limit counters/hot queries **only if
  needed** — start without it. Postgres + CDN cover MVP.

### A.20 Background jobs & queue system

- **n8n** = the orchestration/business-automation layer (explicitly requested).
- **Scheduled jobs:** weekly quota reset, subscription-expiry sweeps, stats rollups,
  abandoned-conversation nudges, review requests.
- **Queue:** for MVP, DB-backed job rows or a managed lightweight queue; introduce a
  proper broker only at scale. Keep it boring.

### A.21 Alternatives comparison (summary)

| Decision | Chosen | Alternative | Why chosen |
|---|---|---|---|
| App topology | Modular monolith | Microservices | Cost/complexity vs tiny scale |
| Frontend | Next.js PWA | SPA / native | SEO + PWA per client + budget |
| API | REST | GraphQL | Simpler to secure/rate-limit |
| DB | Postgres (Supabase) | MySQL / Mongo | RLS, relational fit, managed |
| Auth | Supabase Auth | Custom / Auth0 | Cost + exactly the needed methods |
| Payments | Stripe Billing | Custom / Braintree | PCI SAQ-A, best DX, subscriptions |
| Search | Postgres FTS | Algolia/Elastic | No extra infra for small facet set |
| Automation | n8n | Custom workers | Client-requested, visual, fast |

---

## Part B — Security-First Design (Phase 4)

> Threat context: consumer marketplace with **PII + private messaging + recurring card
> billing**, off-platform transactions, and **no listing pre-approval**. Card data is
> **outsourced to Stripe**, which removes the largest class of risk but makes
> **account security, messaging abuse, and content moderation** the top threats.

### B.1 Authentication

- Supabase Auth; email/password + Google OAuth + phone OTP.
- Passwords never stored by us; OAuth via provider; OTP with attempt limits + expiry.
- Enforce email verification and phone verification before privileged actions.

### B.2 Authorization + B.3 RBAC

- 3 roles (buyer/seller/admin) via JWT claim, enforced at **app middleware + Postgres
  RLS** (§A.6). Principle of least privilege; deny-by-default RLS policies.

### B.4 MFA support

- **TOTP MFA mandatory for admin**, optional (encouraged) for sellers (they hold
  payment + reputation). Recovery codes. Step-up MFA for sensitive changes
  (email/password/payout, subscription cancel).

### B.5 Session management

- Short-lived access JWT + rotating refresh tokens; refresh-token reuse detection.
- Secure cookie flags (`HttpOnly`, `Secure`, `SameSite=Lax/Strict`); idle + absolute
  timeouts; "log out all sessions"; device/session list for the user.

### B.6 Password security

- Handled by Supabase (strong hashing). Enforce length/breached-password checks
  (HaveIBeenPwned k-anonymity), throttle attempts, no user enumeration on reset.

### B.7 Rate limiting

- Per-IP + per-account limits on: login, OTP request, password reset, signup, message
  send, listing create, search. Sliding-window counters (edge/Redis). Exponential
  backoff + lockout on auth abuse.

### B.8 API protection

- Auth on every non-public route; RLS as backstop; input validation (Zod) on every
  payload; output encoding; strict CORS allow-list; security headers (HSTS, CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`); request size limits;
  bot protection (Cloudflare/Turnstile) on signup & messaging.

### B.9 CSRF

- Token-authenticated APIs + `SameSite` cookies; anti-CSRF tokens for any cookie-based
  state-changing form; verify `Origin`/`Referer` on unsafe methods.

### B.10 XSS

- React auto-escaping; **no `dangerouslySetInnerHTML`** with user content; sanitize any
  rich text (DOMPurify server-side); strict **Content-Security-Policy** (nonce-based, no
  inline scripts); escape user content in emails too.

### B.11 SQL injection

- **Parameterized queries / ORM only** (Prisma/Supabase client); never string-concatenate
  SQL; validate & type all inputs; least-privilege DB roles.

### B.12 File-upload validation

- Signed direct uploads; **magic-byte MIME sniffing**, extension allow-list
  (jpg/png/webp), max size + dimensions, **server-side re-encode & EXIF strip**, randomized
  storage keys, `Content-Disposition`/`X-Content-Type-Options: nosniff`, serve from a
  **separate origin/CDN** (no cookies), optional AV/NSFW scan (n8n → ClamAV/vision API).

### B.13 Image validation

- Re-encode through a trusted library (defuse polyglots/decompression bombs), enforce
  pixel limits, reject animated/oversized where not needed, moderation scan before public.

### B.14 Payment security

- **All card data via Stripe Elements/Checkout — the PAN never touches our servers.**
  SCA/3DS enforced (EU). Webhooks **signature-verified + idempotent**. Stripe Radar for
  fraud. No card data logged, ever.

### B.15 PCI DSS considerations

- By outsourcing card entry/storage to Stripe, scope reduces to **SAQ-A** (simplest).
  Obligations: serve payment pages over TLS, don't store/log card data, keep Stripe SDKs
  updated, restrict access. Document this in the compliance appendix.

### B.16 GDPR compliance

- Lawful basis (consent for marketing, contract for service, legitimate interest for
  fraud/security); granular consent + cookie banner (no non-essential trackers pre-
  consent); **DPAs** with sub-processors (Supabase, Stripe, email, n8n host); **RoPA**;
  privacy policy; **DSAR** flows (access/export/erasure/rectification); DPO/contact.
- Erasure nuance: pseudonymize messages/reviews on account deletion (preserve
  counterparties' records + legal/audit obligations) rather than hard-deleting shared
  threads.

### B.17 Data retention

- Defined per data class: messages (e.g. 24 months post-inactivity), audit logs (per
  legal min, e.g. 12–24 months), inactive accounts (dormancy → notify → delete),
  subscription/invoice records (tax retention, often 6–10 yrs — **kept by Stripe**).
  Automated retention sweeps via n8n.

### B.18 Encryption at rest

- Provider-managed AES-256 (Postgres + object storage). Application-level encryption for
  especially sensitive fields if introduced (e.g. phone) via envelope encryption + KMS.

### B.19 Encryption in transit

- **TLS 1.2+ everywhere**, HSTS preload, modern ciphers, cert automation. Internal
  service calls also TLS.

### B.20 Secrets management

- No secrets in code/repo. Use host secret store / Doppler / Vault; per-environment
  secrets; least-privilege API keys; **rotation** for Stripe/DB/OAuth; separate keys per
  env; audit access.

### B.21 Audit logs

- Append-only, tamper-evident (hash-chain optional) for auth events, role/subscription
  changes, admin/moderation actions, data exports/erasures, payment events. Access-
  restricted; retained per policy.

### B.22 Fraud detection

- **Subscription:** Stripe Radar + 3DS + chargeback auto-suspend.
- **Marketplace:** velocity checks (mass listings, mass messaging), duplicate-image/
  counterfeit heuristics, report-driven review, new-account throttling, device/IP
  fingerprinting for repeat offenders. Alerts → n8n → admin queue.

### B.23 Account-takeover (ATO) prevention

- MFA, breached-password blocking, impossible-travel/new-device detection → step-up auth
  + email alert, refresh-token reuse detection, re-auth for sensitive changes,
  notify-on-change (email/phone/password), session revocation.

### B.24 🔝 Highest-risk attack vectors (ranked) & mitigations

| Rank | Vector | Why it's top | Primary mitigation |
|---|---|---|---|
| 1 | **Off-platform scams (business-model risk)** | No buyer protection; payment leaves platform | Ratings + report + seller verification now; **v2 on-platform payments/escrow** |
| 2 | **Malicious/illegal content via no-approval listings** | Instant-live UGC + "everything" | Moderation queue, image scan, report button, prohibited-items policy, DSA notice-and-action |
| 3 | **Account takeover** | Phone/email auth, reputation + billing at stake | MFA, ATO detection, session hardening (§B.23) |
| 4 | **Messaging abuse (spam/phishing/harassment)** | Open buyer→seller channel | Rate limits, block/report, link/contact scrubbing, moderation |
| 5 | **Malicious file uploads** | UGC images | Magic-byte + re-encode + EXIF strip + separate origin (§B.12) |
| 6 | **Subscription payment fraud/chargebacks** | Card-based signups | Stripe Radar + 3DS + auto-suspend |
| 7 | **XSS/CSRF/SQLi (classic web)** | Any web app | CSP, parameterized queries, SameSite, validation (§B.9–11) |
| 8 | **GDPR non-compliance** | EU PII + messages | Consent, DSAR, retention, DPAs (§B.16) |

**Takeaway:** because Stripe absorbs card risk, the platform's real security centre of
gravity is **trust & safety (scams, content, ATO, messaging abuse)** — precisely the area
the "no approval / everything / off-platform" model amplifies. Security spend should skew
there, not toward PCI machinery the model doesn't use.
