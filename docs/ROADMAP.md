# ReWorn — Completion Roadmap

Approved increment order. Work proceeds in small, reviewable increments; each
ends with a verification report and a stop for review. The repository is the
source of truth.

| # | Increment | Status |
|---|---|---|
| 1 | **Repository stabilization** — Next security patch, Node 20 alignment, CI, canonical docs | **in progress** |
| 2 | **Listing domain** — schema/models/migrations/RLS, CRUD, image uploads + ordering, categories, lifecycle (draft/published/paused/archived), ownership validation, listing detail, seller profile, browse/search/filters/pagination, loading/empty/error states | next |
| 3 | Saved items — persistence, RLS, buyer ownership, optimistic UI | pending |
| 4 | Recently viewed | pending |
| 5 | Messaging — conversations, messages, unread, buyer/seller inbox, RLS, abuse protections | pending |
| 6 | Seller dashboard — create/edit/archive/publish, drafts, real listing/inquiry/saved/profile-view analytics (no fabricated stats) | pending |
| 7 | Subscription domain — SubscriptionService, entitlement, quota, grace/suspension/cancellation/renewal, immutable events, `PaymentGateway` + MockPaymentGateway + disabled CaSys adapter (no live bank) | pending |
| 8 | Admin — complete administration area | pending |
| 9 | Accessibility — WCAG review | pending |
| 10 | Performance | pending |
| 11 | PWA — offline assets, manifest, installability | pending |
| 12 | **Bank gateway** — only after the client provides official docs + credentials | blocked (external) |

## Guardrails (standing)

- Keep the existing architecture and security model; no rewrites of working
  code without a verified, documented reason.
- Real Supabase authentication only; no demo personas or fake auth.
- All payment code provider-independent; no live bank gateway or invented CaSys
  details until official documentation and credentials arrive.
- Migrations forward-only; applied migrations are not edited.
- Every increment: git checkpoint → implement → verify → report → stop.
