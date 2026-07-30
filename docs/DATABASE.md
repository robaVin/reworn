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
| 0010 | `listing_bootstrap_key` | `listings.bootstrap_key uuid` + **unique index** — per-form-session idempotency so concurrent auto-draft "first actions" converge on ONE draft |
| 0011 | `seller_handle` | `seller_profiles.handle` (public URL slug for `/shop/[handle]`): deterministic collision-safe reserved-protected backfill, format + reserved-name CHECKs, unique index. Immutable once assigned |
| 0012 | `listing_search_indexes` | Generated weighted `search_vector tsvector` (title A / brand B / material C / description D, `simple` config) + **GIN**; **published-only PARTIAL** btree indexes for keyset (`created_at,id`), (`price_minor,id`), (`category_id,created_at,id`) and a **functional normalized-location** index; drops the speculative 2A `status`-prefixed indexes |
| 0013 | `messaging` | `conversations` + `messages` (Increment 3A). Unique conversation identity `(listing_id, buyer_profile_id, seller_profile_id)`; keyset activity indexes (buyer/seller) + message chronological index; CHECKs (distinct participants, body length 1–4000, non-blank, no control chars); BEFORE-INSERT sender-participant trigger + AFTER-INSERT activity-bump trigger; RLS **participant-only SELECT**, no write grants |
| 0014 | `conversation_listing_lifecycle` | 3A follow-ups: `conversations.listing_id` → **nullable + `ON DELETE SET NULL`** so conversation history survives listing removal, plus an immutable listing snapshot (`listing_title_snapshot` / `listing_price_minor_snapshot` / `listing_currency_snapshot`); activity-bump trigger made **monotonic** via `GREATEST(last_message_at, NEW.created_at)`. Participant FKs stay `ON DELETE CASCADE` |
| 0015 | `message_submission_id` | `messages.client_submission_id uuid` (nullable) + **sender-scoped unique** index `(conversation_id, sender_profile_id, client_submission_id)` for compose idempotency (3B-D). NULL tokens exempt (SQL NULLs distinct); the token is only a dedup key, never identity |
| 0016 | `subscription_pending_unique` | **Partial unique** `ux_one_pending_subscription_per_seller` on `subscriptions(seller_id) WHERE status='pending'` (Increment 4A) — makes `createPendingSubscription` idempotent/race-safe, complementing the Stage-1 one-live partial unique. Raw partial index (not in the Prisma schema); `migrate deploy` only |
| 0017 | `checkout_session` | `payment_attempts.checkout_url` (non-secret provider-hosted URL) + **partial unique** `ux_one_open_attempt_per_subscription` on `payment_attempts(subscription_id) WHERE status='pending' AND subscription_id IS NOT NULL` (Increment 4B) — at most one open checkout attempt per pending subscription, for race-safe session reuse. Raw partial index; `migrate deploy` only |
| 0018 | `listing_slug_delivery` | `listings.slug` (nullable, **unique** `ux_listings_slug`) — a stable, human-readable public URL key for the product detail page (`/products/[slug]`), generated ONCE at first publish and never changed; existing PUBLISHED rows backfilled from `title` + a short id-derived code (drafts stay NULL until first publish, and a UNIQUE index treats NULLs as distinct). Plus `delivery_method` enum (`unspecified`/`shipping`/`pickup`/`both`, NOT NULL default `unspecified`) + nullable `delivery_note` — informational hand-over details; ReWorn never brokers delivery (Increment UX-1.2A) |

Clean-deploy and deploy-on-top-of-previous both verified; no drift.
**`0011`/`0012` were applied to the production Supabase on 2026-07-29** — they are
**required** before `/browse` search/filter/sort or `/shop/[handle]` work.

The generated `search_vector` column + GIN + partial/functional indexes cannot be
expressed in the Prisma schema (the column is declared `Unsupported("tsvector")`
so Prisma never drops it). They are owned by the hand-written migration; the
workflow is **`prisma migrate deploy` only — never `migrate dev`** (which would
try to drop the GIN, as it would for the RLS/CHECK objects since 0002).

## Entities (current)

`profiles` (id == Supabase Auth uuid), `roles`, `user_roles`, `seller_profiles`,
`listings`, `listing_images`, `listing_usage` (weekly quota counter),
`subscription_plans`, `subscriptions`, `subscription_events` (immutable),
`payment_attempts`, `payment_events` (immutable), `categories`, `audit_logs`
(immutable), `conversations`, `messages` (buyer↔seller messaging, Increment 3A —
see `docs/MESSAGING.md`).

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

`product_variants`, `wishlists` (saved items), `recently_viewed`, `reviews`,
`reports`, `notifications`.

## Seed

Development seed (idempotent, production-guarded): 3 roles, 3 **provisional**
plans (7 / 15 / 30 weekly quota, MKD minor units — clearly non-final), 5
categories.
