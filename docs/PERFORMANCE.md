# ReWorn — Marketplace Performance (UX-1)

Measured against the **production build** (`next build && next start`, pinned Node
20.18.1) on the **live Supabase eu-west-1** database, using the `PERF_TRACE=1`
span instrumentation and `curl` TTFB/total timings. All numbers are **measured**
unless labelled *(inferred)* or *(static)*.

> **Note on the reference prototype.** UX-1 was benchmarked against a static
> single-page design prototype (no database, no images, no routing, an in-page
> cart). ReWorn is a real SSR classifieds marketplace with a remote Postgres and
> signed private images, so absolute totals are not directly comparable — the
> prototype's "instant" feel is the feel of a brochure. UX-1 adopts the
> *techniques* that produce that feel (instant streamed shells, warm caching,
> priority LCP images) on top of real data.

## Bottleneck (measured)

The dominant cost on every public route is **transaction-pooler round-trip
latency**, not query complexity or bundle size:

- A single DB round-trip through the transaction pooler (`:6543`, pgbouncer)
  measured **~300–512 ms** during this work (it varies with load; Phase-1 saw
  ~60 ms at a quieter moment). The session pooler (`:5432`) measured **~103 ms**
  for the same round-trip — ~5×.
- `EXPLAIN (ANALYZE)` of the heaviest catalog queries shows **sub-millisecond**
  execution at current data volume (related products: **0.94 ms**). So the
  hundreds of milliseconds are latency, not compute.
- The old `db.listingBySlug` cost **~1127 ms** because Prisma's nested
  `findFirst` issued **two** round-trips (main row + a separate images query).

## Changes selected (with measured effect)

| # | Change | Effect (measured) |
|---|---|---|
| 1 | **Detail read → single raw `json_agg` query** (`fetchPublicDetail`), replacing Prisma nested `findFirst` | `db.listingBySlug` **1127 ms → ~302 ms** (2 round-trips → 1). PDP cold total **1.77 s → 0.85 s**. Output parity test included. |
| 3 | **Streaming shells** on `/` (Suspense around the feed; static Hero is the shell) and `/shop/[handle]` (`loading.tsx`) | shell TTFB: `/` **451 ms → 17 ms**; `/shop` buffered-~450 ms → **16 ms**. |
| 4 | **In-process tagged catalog cache** (30 s TTL) over all anonymous reads, invalidated on listing transitions | Warm-hit total **~24–30 ms** on every route (0 DB round-trips). |
| 5 | **Priority LCP images**: first row of grid covers (`priorityCount={4}`) + the first PDP gallery image | first cover/LCP image no longer lazy; remaining covers stay lazy. |

## Changes rejected (with reason)

- **Index for related products (#2):** the ranking sort keys are runtime-
  parameter-dependent booleans (same-brand/category/size) that no btree can
  satisfy; `EXPLAIN` shows 0.94 ms execution and the `status='published'` filter
  already has partial indexes (migration 0012). **No index is justified; no
  migration added.** A candidate pre-filter (same brand OR category) is noted as
  a future *scale* option if the published set grows large.
- **Flipping production to the session pooler (#6):** see the decision below —
  measured 5× faster, but a production DB-routing change requires an explicit
  rollout/rollback and a confirmed long-lived (non-serverless) runtime, so it is
  **documented, not applied**.
- **Client-JS rewrites (#9):** route/first-load JS is unchanged and modest
  (shared 103 kB; browse 135, PDP 121, shop 111); JS is not a bottleneck, so no
  speculative rewrites. No gallery/carousel library was introduced.

## Before / after (measured, prod build, warm process)

TTFB = first byte (streamed shell); total = full response. Cold = catalog cache
expired (DB round-trips); warm = cache hit.

| Route | shell TTFB before | shell TTFB after | total cold before | total cold after | total **warm (cache hit)** |
|---|---|---|---|---|---|
| `/` | 451 ms (buffered) | **17 ms** | 459 ms | 668 ms *(streamed)* | **29 ms** |
| `/browse` | 19 ms | 21 ms | 584 ms | 438 ms | **30 ms** |
| `/products/[slug]` | 1174 ms (2B: buffered→13 ms) | **16 ms** | 1770 ms | **851 ms** | **27 ms** |
| `/shop/[handle]` | ~450 ms (buffered) | **16 ms** | ~731 ms | 731 ms *(streamed)* | **24 ms** |

Per-operation (measured spans, ms, ~1 round-trip each at current latency):
`db.listingBySlug` **302** (was 1127) · `db.browse` **~300** · `db.related`
**306** · `db.sellerResolve` **300** · `storage.sign` **~100–290**.

`/` and `/shop` cold totals are *higher* than their old buffered TTFB only
because the number now measures the **full streamed** response; the user-visible
first paint dropped from ~450 ms to ~16 ms and there is no blank screen. PDP cold
total nearly halved from the raw-query change; every route's warm total is ~25–30 ms.

### Query & signing counts per request

| Route | Cold (cache miss) | Warm (cache hit) |
|---|---|---|
| `/` | 2 queries (`listPublished` + `categories`) + 1 batched sign | 0 catalog queries, 0 sign |
| `/browse` | 2 queries + 1 batched sign | 0, 0 |
| `/products/[slug]` | 2 catalog queries (`listingBySlug` + `related`) + 2 batched signs; `auth`+`cta` separate | 0 catalog queries, 0 sign; `auth`+`cta` ~3 ms *(not cached — per-user)* |
| `/shop/[handle]` | 3 queries (`sellerResolve` + `listPublished` + `count`) + 1 batched sign | 0, 0 |

No N+1: images use one `json_agg` (detail) or one batched `createSignedUrls`
(grids/related). The single-key sign path is never used on public reads.

## Caching (in-process tagged cache)

`src/lib/catalog-cache.ts` — `cachedCatalog(key, fn, ttl)` + `invalidateCatalog()`.

- **What is cached:** only public, non-user-specific DTOs — `listPublishedListings`
  (browse/home/shop grids), `listBrowseCategories`, `getPublicListing` /
  `getPublicListingBySlug` (PDP base), `getRelatedListings`, `resolvePublicSeller`,
  `countSellerPublishedListings`.
- **What is NOT cached:** the authenticated message-CTA state (`resolveMessageCtaState`
  / `getAuthContext`) — it runs per request in its own Suspense boundary — and any
  private seller / subscription / payment data.
- **Keys:** derived from public inputs (browse filter fingerprint + sort + cursor
  + pageSize + sellerId; slug; id; related ranking tuple; handle).
- **TTL:** `CATALOG_TTL_MS = 30 s` — far below the **1 h** signed-URL lifetime, so
  a cached signed image URL can never be served past its expiry. Also a backstop:
  any missed invalidation self-heals within 30 s.
- **Invalidation:** one broad `invalidateCatalog()` tag, called on **every listing
  lifecycle transition** (`transitionListing`: publish / republish / pause /
  archive). A public-field or cover-image edit is only ever visible through a
  `pause → edit → republish` cycle, and both ends are transitions, so no separate
  hook on the draft/paused `updateListing`/image paths is required. Over-
  invalidation (cold after any change) is the safe direction — **stale public data
  is never served**.
- **Cache miss vs hit (measured):** miss ~438–851 ms total; hit **~24–30 ms**.
- **Behavior proven by tests:** miss executes the loader; hit within TTL skips it;
  entry re-executes after TTL; `invalidateCatalog` clears everything; and an
  end-to-end integration test shows a read is served from cache (stale after a raw
  DB write) and a **service transition invalidates** it (a paused listing returns
  `null`, not the stale published DTO).
- **Deployment scope:** process-local — effective for a **long-lived server**
  (the app's measured, session-pooler-friendly model). Under horizontal
  autoscaling it is per-instance; the serverless-appropriate evolution is Next's
  `unstable_cache` + `revalidateTag` wrapping the same read functions (deferred
  because its request-scoped incremental cache cannot be exercised in the test
  harness, and this project requires proven invalidation).

## Database connection / pooler decision

**Measured** (median, prod, read-only), per single round-trip:

| Query | transaction pooler `:6543` | session pooler `:5432` |
|---|---|---|
| `SELECT 1` | 512 ms | 103 ms |
| detail (`json_agg`) | 512 ms | 103 ms |
| Prisma nested detail | 1127 ms | 411 ms |

**Decision: keep the transaction pooler as the app's production routing for now;
do NOT flip to the session pooler in this increment.** Rationale:

- The session pooler is ~5× faster per round-trip and would cut every cold read
  accordingly — a large win **for a long-lived server**.
- But the session pooler holds a real connection per client and has a **low
  connection ceiling**; it is unsafe under serverless / horizontal autoscaling,
  where the transaction pooler (pgbouncer) is required. The deployment model is
  not yet fixed (`NEXT_PUBLIC_APP_URL` is still local).
- Changing production DB routing needs an explicit **rollout + rollback** plan and
  a confirmed runtime model, which is out of scope for a code-only increment.

**Recommended rollout when a long-lived runtime is confirmed:** point the app's
`DATABASE_URL` at the session pooler (`:5432`), keep `DIRECT_URL` for migrations,
load-test connection counts against the plan's ceiling, and keep the transaction-
pooler URL as the instant rollback. Combined with the caching above, cold reads
would drop to ~100–150 ms and warm reads stay ~25 ms.

## Async waterfall audit

- **Home / browse:** `Promise.all([listPublishedListings, listBrowseCategories])`
  — already parallel. *(retained)*
- **PDP:** the listing is fetched first (proves public); the auth-dependent CTA
  and the related query each run in their **own** Suspense boundary, so neither
  blocks the primary content. `getAuthContext` is memoized/shared with the header.
  *(retained; no auth work precedes public validation.)*
- **Shop:** `resolvePublicSeller` runs first (required for `notFound()` + the
  seller id), then `Promise.all([listPublishedListings, countSellerPublishedListings])`.
  The seller-first step is a **necessary** dependency, not an avoidable waterfall.
  *(retained.)*
- **Metadata:** `generateMetadata` and the page body share the memoized
  `getPublicListingBySlug` / `resolvePublicSeller`, so the listing/seller is looked
  up **once** per request (verified via spans).

No new parallelization was needed — the prior increments already parallelized the
independent work; the remaining sequential steps are genuine data dependencies.

## Navigation & prefetch (verified, prod build)

Product cards render a **single** `next/link` (one primary link per card);
pagination "Next page" is a `Button href` which also renders `next/link`. Both
therefore get Next's default viewport prefetch in production. Prefetch is not
disabled anywhere. No duplicate primary links.

## Bundles (static)

Shared first-load JS **103 kB**; `/browse` 135 kB, `/products/[slug]` 121 kB,
`/shop/[handle]` 111 kB, `/` 111 kB. Unchanged by Phase 3 (server-side + streaming
work only). No performance library added.

## Remaining limitations

- Cold reads are still latency-bound (~300 ms/round-trip on the transaction
  pooler). The session pooler (documented above) is the biggest remaining lever.
- The catalog cache is process-local (per-instance under autoscaling).
- Related-product ranking sorts the published set; a candidate pre-filter would
  bound it at very large catalog sizes (not needed at current volume).
