# ReWorn — Product Detail Pages (Increment UX-1.2B)

The canonical public product page lives at **`/products/[slug]`**. It is built
for immediate perceived responsiveness via **streaming** while presenting the
complete product experience. The public read path still hard-filters
`status = 'published'`; nothing here widens visibility.

## Canonical routing

- **Exact published slug** → renders the PDP.
- **Unknown / malformed slug** → `notFound()`.
- **Draft / paused / archived / otherwise non-public** → `notFound()`
  (indistinguishable from missing — a hidden listing never reveals it exists).

There is **exactly one canonical URL per public listing**: the exact persisted
`slug`. The short id code is **not** parsed out of an arbitrary slug, so a
listing can never be served under multiple URLs. `getPublicListingBySlug`
normalizes case and looks up the stored slug exactly.

## Legacy route

`/listing/[listingId]` is **retained**. For a valid public listing it resolves
the canonical stored slug and issues a **permanent 308 redirect** to
`/products/[slug]`. Unknown / malformed / non-public ids fall through to the same
indistinguishable `notFound()`. The legacy route now ships only the redirect
(**175 B** route JS, down from a full page) — all public card links already point
at the canonical URL, so the redirect is a safety net for inbound/old links.

## Streaming & perceived performance

- The route has a `loading.tsx` **skeleton shell** (layout-stable, reserved
  image/element dimensions, hidden from assistive tech behind one polite
  "Loading product" status) — so the shell paints immediately.
- The **primary content** (gallery, title, price, availability, attributes,
  delivery, seller) resolves in the main streamed boundary.
- The **message CTA** (auth-dependent) and **related products** each stream in
  **their own Suspense boundary**, so neither the auth lookup nor the related
  query ever delays the primary content.

### Measured (production build, Node 20.18.1, live Supabase eu-west-1, warm)

| Metric | `/products/[slug]` | Prior `/listing/[id]` (Phase 1) |
|---|---|---|
| **Shell TTFB** | **~13–32 ms** (streamed) | ~1174 ms (buffered, blank) |
| First contentful paint | shell is instant | ~1.2 s blank, then all at once |
| Total (full stream) | ~1.77 s | ~1.18 s |

The **first paint is ~35–90× faster** and there is **no blank page** while the
database / signing work completes. Total wall-clock is similar because the
underlying data cost is unchanged — it is now **hidden behind the shell** instead
of blocking the first byte. Shell TTFB is comparable to `/browse` (~30 ms) and
meets the "< 50 ms warm" target.

### Query & signing shape (per PDP request, from `PERF_TRACE` spans)

- `db.listingBySlug` ×1 — Prisma nested `findFirst` (category + seller + images).
  **Deduplicated to one call per request** across `generateMetadata` and the page
  body via React `cache()` (verified: exactly one span per request).
- `db.related` ×1 — one bounded raw-SQL query (`LIMIT 8`), **no N+1**.
- `storage.sign` — one **batched** call for the gallery; the related-cover batch
  is skipped entirely when related products have no covers. The single-key sign
  path is never used on this route.
- `auth.getUser` + `auth.getAuthContext` — ~3 ms warm, in the CTA boundary only,
  and only **after** the listing is proven public.

**Known cost / Phase-3 target:** `db.listingBySlug` measured **~1.1–1.3 s** — the
Prisma nested select pays the transaction-pooler penalty (~5× vs a raw query;
`db.related`, a raw query, is ~0.5 s for comparison). Converting the detail read
to a single raw query (as `listPublishedListings` already is) and/or the
session-pooler experiment is the main Phase-3 lever. Streaming already removes the
user-visible impact.

## Content

Image gallery, title, price (informational), availability, condition, brand,
category, size, colour, description, seller display name + shop link, seller
location (only the already-public `location` field), publication date (semantic
`<time>`), delivery method + optional note, message-seller CTA, breadcrumb, and
related products.

**Never exposed:** listing UUID, seller/profile UUID, storage keys, private
contact details, provider/payment identifiers, or internal moderation fields.
(The reused messaging form carries the listing's own id as its single hidden
field — the established conversation-creation boundary — never a participant id.)

## Delivery rendering

Stored method → public label:

| method | label |
|---|---|
| `unspecified` | Arrange delivery directly with the seller |
| `shipping` | Shipping available |
| `pickup` | Collection available |
| `both` | Shipping or collection available |

The optional note renders as **plain text** in a newline-preserving paragraph
(`whitespace-pre-line`) — React escapes it, so no HTML is rendered and URLs are
not auto-linked. Validation (`schemas.ts`) enforces **trim**, a **documented max
of 200** (`DELIVERY_NOTE_MAX`), and **rejection of disallowed control characters**
(tab/newline/carriage-return permitted; other C0 + DEL rejected).

## Image gallery

`next/image` throughout. The first image is the **LCP candidate** and receives
`priority` (Next emits a preload). Remaining images and thumbnails are lazy.
Stable `aspect-square` containers prevent layout shift; responsive `sizes`;
alt text derived from `${title}` (thumbnails are decorative). Thumbnails are real
keyboard-operable buttons with visible focus and `aria-current`; the gallery works
without hover. With no images an accessible garment-glyph fallback renders. The
only client state is the selected index — no gallery library.

## Message CTA

Reuses the existing conversation-creation boundary (`MessageSellerCta` /
`MessageSellerForm` / `resolveMessageCtaState`) — messaging authorization is not
duplicated. States: **anonymous** → sign-in link preserving a safe `next` (the
canonical `/products/[slug]`); **buyer** → message form; **owner** → non-interactive
"your listing" note (no self-message); **unavailable** → not reachable (the PDP
`notFound()`s for non-public listings). No participant ids appear in input or
markup.

## Related products

`getRelatedListings` returns **at most 8** OTHER published listings, excluding the
current one and any non-public row (so no duplicate path). Deterministic ranking:

1. same brand, 2. same category, 3. same size, 4. nearest price,
5. newest publication date, 6. stable id tie-break.

One bounded query + one batched cover-sign (no N+1). NULL-safe: each match tier is
`COALESCE(<match>, false)` so a NULL attribute cannot sort ahead of a real match
(Postgres `DESC` places NULLs first otherwise). With no matches the section is
omitted.

## Card navigation

All public product-card links point to the canonical `/products/[slug]` via the
shared `productHref(card)` helper — audited across **home**, **browse**, **shop**,
and **related products** (the single reusable `ListingCard`/`ListingGrid`). Each
card is one `next/link` (prefetch retained). `productHref` falls back to the legacy
id route only if a slug is somehow absent (which then 308-redirects).

## SEO & structured data

Server-generated metadata: title, description, canonical `/products/[slug]`,
OpenGraph (title/description/url/image), and Twitter card. Unknown/non-public
products emit **no product-specific metadata** (`robots: noindex`, generic title).
`generateMetadata` and the page share the memoized `getPublicListingBySlug`, so the
listing is looked up **once** per request.

**JSON-LD** (`buildProductJsonLd`): a schema.org `Product` with only truthful
available data — name, description, image, brand, category, colour, size,
`itemCondition` (`UsedCondition`, or `NewCondition` for new), and an `Offer`
(price, currency, `availability: InStock` for a published listing, url). It never
claims ratings, reviews, shipping prices, return policy, checkout, or inventory
quantities. Serialization goes through `safeJsonLdString` (escapes `<`, `>`, `&`,
U+2028/U+2029) so hostile listing text cannot terminate the `<script>` or inject
markup — covered by a regression test with `</script>`-style input.

## Accessibility

One `<h1>`; `<dl>` attribute list; breadcrumb `<nav aria-label="Breadcrumb">`;
descriptive image alternatives; keyboard-operable gallery with visible focus;
accessible CTA names; semantic `<time datetime>`; skeletons `aria-hidden` with a
single polite status; availability communicated by **text** ("Available"), not
colour alone.
