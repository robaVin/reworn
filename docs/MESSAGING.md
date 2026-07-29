# ReWorn — Messaging (Increment 3A)

Secure backend for buyer ↔ seller conversations about a listing. **3A is domain,
database, authorization, service-layer and tests only** — there is no inbox or
conversation UI, and real-time delivery is explicitly deferred (see below).

ReWorn never processes the garment payment or shipping; buyers and sellers
arrange those directly. Messaging only carries their plain-text conversation.

## Model

Two tables (migration `0013_messaging`):

- **`conversations`** — one row per `(listing, buyer, seller)`. `buyer_profile_id`
  and `seller_profile_id` are both **Profile (auth) uuids**; the seller id is the
  listing owner's `SellerProfile.profileId`, derived server-side. `last_message_at`
  drives inbox ordering.
- **`messages`** — `conversation_id`, `sender_profile_id`, plain-text `body`,
  `created_at`. Append-only in 3A (no edit/delete).

## Conversation uniqueness & idempotent creation

Identity is a **database `UNIQUE (listing_id, buyer_profile_id, seller_profile_id)`**
(`conversations_identity_key`), not an application check. `getOrCreateConversationForListing`
inserts and, on the unique violation (`P2002`), returns the existing row — so
concurrent "first message" requests converge on **one** conversation. A buyer may
only start a conversation from a **currently-published** listing, and never with
their own listing (`buyer <> seller` is also a `CHECK`).

## Participant authorization

The participant identity is always the **server-verified user id** (from
`getAuthContext`); the client may supply only a `listingId`, a message body, and
cursors — never a buyer/seller/sender id or conversation ownership. A single
resolver, `resolveConversationAccess`, loads the conversation and confirms the
user is the buyer or seller; **missing, non-participant, and malformed-id all
return the same not-found**, so a third party gets no existence signal. Every
service method funnels through this resolver (no duplicated checks).

`sendConversationMessage` sets `sender_profile_id` to the verified user; a
`BEFORE INSERT` trigger independently rejects any message whose sender is not a
participant.

## Listing-status behaviour

- A **new** conversation requires the listing to be `published`.
- An **existing** conversation stays reachable to its two participants regardless
  of later status changes (paused / archived), because access is participant-based
  and independent of listing status.
- A now-private listing is shown to participants through a **participant-authorized
  internal summary** on the conversation — it is **never** re-exposed through the
  public listing service (`getPublicListing` still returns null for it).

## Message rules

Plain text only (no HTML is parsed or rendered). The service normalises and
validates every body, with DB `CHECK`s as a backstop:

- line endings normalised to `LF`; surrounding whitespace trimmed (internal
  newlines preserved);
- empty / whitespace-only rejected;
- control characters rejected except TAB and LF;
- **maximum length 4000** Unicode code points (agrees with Postgres `char_length`).

## Pagination

Keyset (never offset), with opaque versioned base64url cursors:

- **Messages** — `created_at ASC, id ASC`; cursor bound to the `conversationId`
  (a cursor from another conversation is rejected). Page size 30.
- **Summaries** — `last_message_at DESC, id DESC`; cursor bound to the
  authenticated participant. Page size 20.

Malformed / wrong-version / mismatched cursors reset to the first page.

## Activity update (trigger, not app step) — monotonic

An `AFTER INSERT` trigger advances `conversations.last_message_at`/`updated_at`
so the two writes commit **atomically**. This is chosen over a second application
write (which could fail after the insert) and over a plain transaction (which
would not protect a future direct write path).

The bump uses `last_message_at = GREATEST(last_message_at, NEW.created_at)`
(migration 0014), so it is **monotonic**: a concurrent or out-of-order insert of
an older-timestamped message can **never move `last_message_at` backwards**. It
therefore always reflects the newest message actually inserted.

## RLS assumptions

Both tables are `ENABLE`/`FORCE ROW LEVEL SECURITY`. Following the project's
two-layer model:

- **Grants:** `anon` gets nothing; `authenticated` gets `SELECT` only. There are
  **no** INSERT/UPDATE/DELETE grants, so user-driven writes are impossible
  regardless of policy.
- **Policies:** participants-only `SELECT` on conversations and messages. No admin
  policy (private correspondence; moderation is out of scope) and no write policy.
- All writes go through the **privileged Prisma/service-role path** (BYPASSRLS),
  which additionally enforces participant authorization in application code. RLS
  is defence in depth, not a substitute for the service checks.

## DTO privacy

Public DTOs expose only what a participant needs — listing summary, counterparty
(shop name + handle for a seller; self-chosen display name or a neutral fallback
for a buyer), latest-message preview, and activity timestamp. They **never**
expose profile ids (buyer/seller/sender), auth ids, emails, seller internal ids,
subscription/payment data, or internal listing owner id. A message's authorship is
conveyed by a boolean `sentByViewer`, not the sender's id.

### Buyer identity limitation

Buyers have no dedicated public profile yet. The counterparty display for a buyer
uses `Profile.displayName` when set, else the neutral label **"ReWorn member"** —
never an email or internal id. A richer buyer public profile can arrive with a
later increment.

## Deletion lifecycle

- **Listing status change** (pause/archive): conversation preserved and reachable
  (access is participant-based, independent of status).
- **Listing row hard-delete** — `listing_id` FK is **`ON DELETE SET NULL`**
  (migration 0014). Conversation **history must survive listing removal**, so a
  deleted listing nulls the reference and the conversation + its messages remain.
  An **immutable listing snapshot** (`listing_title_snapshot`,
  `listing_price_minor_snapshot`, `listing_currency_snapshot`), captured at
  creation, preserves what the conversation was about; the DTO shows the live
  listing while it exists and falls back to the snapshot (status `"removed"`) once
  it is gone. *(RESTRICT was rejected — it would make the profile → seller →
  listing CASCADE chain fail whenever a conversation referenced the listing;
  SET NULL + snapshot preserves history without breaking that chain.)*
- **Profile / seller hard-delete**: the participant FKs remain `ON DELETE CASCADE`,
  so that user's conversations + messages cascade away — privacy-preserving (a
  removed account leaves no orphaned private messages). No account-deletion path
  exists yet.
- **Conversation delete**: cascades its messages. No user-facing delete in 3A.

## Conversation creation (Increment 3B-A)

A buyer starts (or reopens) a conversation from a **published** listing via a
**Server Action** — `startConversationAction` (`src/modules/messaging/actions.ts`).

- **Why a Server Action, not a Route Handler:** Next.js Server Actions are
  POST-only, invoked through an encrypted per-build action id with framework
  same-origin / CSRF protection, so there is **no GET mutation path** and no
  client-forgeable endpoint. They give **progressive enhancement**
  (`<form action>` works without JS), first-class `redirect()`, and the identity
  comes from the **server auth context**. CSRF is therefore framework-provided;
  we add nothing.
- **Input contract:** the ONLY accepted field is `listingId` (a hidden input
  mirroring the URL). Participant ids (`buyerProfileId` / `sellerProfileId` /
  `senderProfileId`), a client-chosen `conversationId`, and arbitrary redirect
  URLs are **never** accepted. The buyer is the verified user.
- **Testable seam:** the action is a thin wrapper over
  `resolveStartConversation(userId, listingId)` (`conversation-actions.ts`),
  which returns a redirect target or a safe failure kind and performs no
  redirect/side-effect — so the full behaviour matrix is unit/integration
  tested without a request context.
- **Idempotency & concurrency:** delegates to the 3A atomic
  `getOrCreateConversationForListing`; there is **no** application-level
  find-then-insert. Repeated and concurrent submissions resolve to one row.
- **Authentication:** an unauthenticated submission creates **nothing** and
  redirects to `/login?next=/listing/[id]` (a server-derived, `safeRedirectPath`-
  validated internal path — no open redirect, no sensitive data in the URL).
- **Self-message prevention:** a seller submitting for their own listing gets the
  `ownListing` result (403 mapped), never a conversation.
- **Non-disclosure:** draft / paused / archived / removed / malformed / unknown
  listing ids all map to the same `notFound` — creation cannot probe existence.
- **Result contract:** non-redirect outcomes are a small typed union
  (`notFound | ownListing | validationError | unexpected`); the client renders a
  generic message. Raw Prisma/SQL errors, stack traces, and any ids never reach
  the client (`unexpected` is logged server-side through the redacting logger).
- **Redirect contract:** on success the action redirects to
  **`/messages/[conversationId]`**. That route is **not implemented in 3B-A** and
  404s until the conversation UI ships in **3B-C**.
- **Listing-page control** (`/listing/[listingId]`, published only): authenticated
  non-owner → "Message seller" form; owner → non-interactive "This is your
  listing"; guest → a sign-in link that returns to the listing. The form is
  keyboard accessible with a pending state and submits only `listingId`.

## Explicitly deferred

Real-time messaging (WebSocket/Supabase Realtime subscriptions), inbox &
conversation UI, notifications (email/push), read receipts, typing indicators,
reactions, message editing/deletion, attachments/images, blocking, reporting, and
moderation tooling are **out of scope for 3A** and arrive in later increments.
