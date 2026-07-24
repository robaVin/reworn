# ReWorn — Database (as migrated)

PostgreSQL via Prisma. UUID primary keys for externally-referenced records;
timezone-aware `timestamptz` (UTC); money as **integer minor units** + ISO-4217
`char(3)`. No passwords/tokens/OTP/secrets are stored.

## Migrations (forward-only)

| # | Migration | Purpose |
|---|---|---|
| 0001 | `init` | Prisma-generated baseline DDL (tables, enums, indexes, FKs) |
| 0002 | `security_rls_immutability_constraints` | RLS ENABLE+FORCE (deny-by-default), immutability triggers, idempotency/CHECK constraints, conditional `profiles.id → auth.users` FK |
| 0003 | `subscription_events_payment_attempt_fk` | FK + index for `subscription_events.payment_attempt_id` |
| 0004 | `scoped_rls_policies` | Minimum scoped RLS policies + portable JWT-claim helpers |

Clean-deploy and deploy-on-top-of-previous both verified; no drift.

## Entities (current)

`profiles` (id == Supabase Auth uuid), `roles`, `user_roles`, `seller_profiles`,
`listing_usage` (weekly quota counter), `subscription_plans`, `subscriptions`,
`subscription_events` (immutable), `payment_attempts`, `payment_events`
(immutable), `categories`, `audit_logs` (immutable).

Enums include the subscription lifecycle: `pending | active | grace_period |
expired | cancelled | suspended`.

## Key constraints & indexes

- **Idempotency / duplicate protection:** `unique(merchant_reference)`;
  partial-unique `provider_reference` and `payment_events.provider_event_id`;
  partial-unique **one live subscription per seller** (`active|grace_period`);
  `unique(seller_id, iso_year, iso_week)` for quota.
- **CHECK:** non-negative money, ISO-3 currency, `term_days>0`, `used<=quota`,
  period ordering.
- **Immutability:** UPDATE-blocking triggers on `subscription_events`,
  `payment_events`, `audit_logs` (fire even for the service role).

## RLS policies (migration 0004)

Deny-by-default base; scoped reads: own profile; own roles (+ admin);
own seller profile (+ admin); public read of **active** plans + categories; seller
owner reads own subscriptions/payment attempts (+ admin); financial-event and
audit tables are **admin-read only**. The only user-writable path is a
column-scoped `UPDATE(display_name, avatar_url, locale)` on one's own profile.
Portable helpers `public.current_app_user_id()` / `current_app_is_admin()` read
the request JWT so the same policies run on Supabase and on plain Postgres (CI).

## Missing entities (arrive with their increments)

`listings/products`, `product_images`, `product_variants`, `conversations`,
`messages`, `wishlists` (saved items), `recently_viewed`, `reviews`, `reports`,
`notifications`.

## Seed

Development seed (idempotent, production-guarded): 3 roles, 3 **provisional**
plans (7 / 15 / 30 weekly quota, MKD minor units — clearly non-final), 5
categories.
