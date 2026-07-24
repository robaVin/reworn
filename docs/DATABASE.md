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
| 0005 | `listings` | `listings` table, enums (`listing_status`, `listing_gender`, `listing_condition`), indexes, FKs |
| 0006 | `listings_rls_constraints` | Listing CHECK constraints + RLS read policies (public sees published; owner/admin see own) |
| 0007 | `listing_draft_nullable` | Makes non-title content columns nullable so incomplete drafts can be saved; publish-completeness enforced in the service |
| 0008 | `listing_images` | `listing_images` table (unique `storage_key`, `(listing_id, position)` index, cascade FK) |
| 0009 | `listing_images_rls_constraints` | Image CHECK constraints (positive dims/size, position≥0, MIME allow-list) + RLS read policies; **no write policies** (writes only via privileged service) |

Clean-deploy and deploy-on-top-of-previous both verified; no drift.

## Entities (current)

`profiles` (id == Supabase Auth uuid), `roles`, `user_roles`, `seller_profiles`,
`listings`, `listing_images`, `listing_usage` (weekly quota counter),
`subscription_plans`, `subscriptions`, `subscription_events` (immutable),
`payment_attempts`, `payment_events` (immutable), `categories`, `audit_logs`
(immutable).

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

## Listing images & object storage (Increment 2C)

Image **files** live in a **private** Supabase Storage bucket (`listing-images`);
only metadata rows live in `listing_images`. Uploads are server-authoritative:
the seller UI never touches Storage directly. The service validates the real file
signature (magic bytes — JPEG/PNG/WebP only; SVG and GIF rejected), re-encodes via
`sharp` (EXIF/GPS stripped, orientation normalised, resized to ≤1600px, WebP),
then uploads under an unguessable key (`<listingId>/<uuid>.webp`) **before**
writing the DB row; a DB failure compensates by deleting the just-uploaded object,
so no orphans and retries stay clean. Reads are short-lived **signed URLs**. RLS
on `listing_images` grants only SELECT (public → images of published listings;
owner/admin → their own); there are **no** INSERT/UPDATE/DELETE policies, so the
only write path is the privileged service. Bucket must be created as **private**
(see `docs/ARCHITECTURE.md` / the increment report for the one-time setup).

## Missing entities (arrive with their increments)

`product_variants`, `conversations`, `messages`, `wishlists` (saved items),
`recently_viewed`, `reviews`, `reports`, `notifications`.

## Seed

Development seed (idempotent, production-guarded): 3 roles, 3 **provisional**
plans (7 / 15 / 30 weekly quota, MKD minor units — clearly non-final), 5
categories.
