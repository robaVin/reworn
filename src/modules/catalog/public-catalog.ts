import 'server-only';

import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { timeSpan } from '@/lib/perf';
import { getStorageAdapter } from './storage';
import { SIGNED_URL_TTL_SECONDS } from './image-config';
import { normalizeHandle } from './handle';
import { encodeCursor, decodeCursor } from './cursor';
import { filterFingerprint, type BrowseQuery } from './browse-query';
import { cachedCatalog } from '@/lib/catalog-cache';

/**
 * Public marketplace read layer. EVERY function here hard-filters
 * `status='published'` and NEVER reads the viewer's identity, so ownership can
 * never widen public visibility. Output is mapped to explicit DTOs that contain
 * only intentionally-public fields — no seller/profile UUIDs, email,
 * subscription, status, or private metadata ever leaves this module.
 */

export interface PublicListingCard {
  id: string;
  /** Stable public slug for /products/[slug]. Non-null for published rows. */
  slug: string | null;
  title: string;
  brand: string | null;
  size: string | null;
  condition: string | null;
  gender: string;
  priceMinor: number | null;
  currency: string;
  categorySlug: string | null;
  categoryName: string | null;
  coverUrl: string | null;
}

export interface PublicListingPage {
  items: PublicListingCard[];
  nextCursor: string | null;
}

export interface PublicSellerProfile {
  handle: string;
  shopName: string;
  joinedAt: Date;
}

export interface PublicListingDetail extends PublicListingCard {
  description: string | null;
  color: string | null;
  material: string | null;
  location: string | null;
  /** How the seller offers to hand the item over (informational). */
  deliveryMethod: string;
  /** Optional free-text delivery detail (informational). */
  deliveryNote: string | null;
  originalPriceMinor: number | null;
  createdAt: Date;
  seller: PublicSellerProfile;
  images: { url: string; width: number; height: number }[];
}

interface Row {
  id: string;
  slug: string | null;
  title: string;
  brand: string | null;
  size: string | null;
  condition: string | null;
  gender: string;
  priceMinor: number | null;
  currency: string;
  categorySlug: string | null;
  categoryName: string | null;
  coverKey: string | null;
  createdAt: Date;
  rank?: number;
}

/** Active categories (public slug + display name) for the browse filter. */
export async function listBrowseCategories(): Promise<
  { slug: string; name: string }[]
> {
  return cachedCatalog('categories', () =>
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { slug: true, name: true },
    }),
  );
}

/** Batch-sign a set of storage keys (one round-trip); missing keys omitted. */
async function signCovers(keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  return timeSpan(
    'storage.sign',
    () => getStorageAdapter().createSignedUrls(keys, SIGNED_URL_TTL_SECONDS),
    { count: keys.length },
  );
}

/**
 * Published listings for the public browse grid (and, scoped by `sellerId`, a
 * seller's public catalogue). Filters/search/sort/keyset all run in Postgres;
 * results are bounded by `pageSize`; cover URLs are batch-signed once.
 */
export async function listPublishedListings(
  query: BrowseQuery,
  opts: { sellerId?: string } = {},
): Promise<PublicListingPage> {
  const key = `list:${opts.sellerId ?? ''}:${query.sort}:${query.pageSize}:${query.cursor ?? ''}:${filterFingerprint(query)}`;
  return cachedCatalog(key, () => listPublishedListingsUncached(query, opts));
}

async function listPublishedListingsUncached(
  query: BrowseQuery,
  opts: { sellerId?: string } = {},
): Promise<PublicListingPage> {
  const take = query.pageSize;
  const fp = filterFingerprint(query);
  const cur = decodeCursor(query.cursor, { sort: query.sort, fp });

  const conds: Prisma.Sql[] = [Prisma.sql`l.status = 'published'`];
  if (opts.sellerId) {
    conds.push(Prisma.sql`l.seller_id = ${opts.sellerId}::uuid`);
  }
  if (query.q) {
    conds.push(
      Prisma.sql`l.search_vector @@ websearch_to_tsquery('simple', ${query.q})`,
    );
  }
  if (query.categorySlug) {
    // Filter on l.category_id (via a scalar subquery) rather than the joined
    // c.slug, so the planner can use the partial (category_id, created_at, id)
    // index. Unknown slug -> subquery NULL -> no rows (correct empty result).
    conds.push(
      Prisma.sql`l.category_id = (SELECT id FROM categories WHERE slug = ${query.categorySlug})`,
    );
  }
  if (query.sizes.length > 0) {
    conds.push(Prisma.sql`l.size = ANY(${query.sizes})`);
  }
  if (query.conditions.length > 0) {
    conds.push(
      Prisma.sql`l.condition = ANY(${query.conditions}::listing_condition[])`,
    );
  }
  if (query.gender) {
    conds.push(Prisma.sql`l.gender = ${query.gender}::listing_gender`);
  }
  if (query.minPrice !== undefined) {
    conds.push(Prisma.sql`l.price_minor >= ${query.minPrice}`);
  }
  if (query.maxPrice !== undefined) {
    conds.push(Prisma.sql`l.price_minor <= ${query.maxPrice}`);
  }
  if (query.location) {
    // NOTE: '\\s+' so the tagged-template COOKED string is '\s+' (a template
    // literal silently turns '\s' into 's'); this must match the functional
    // index expression in migration 0012 exactly.
    conds.push(
      Prisma.sql`lower(regexp_replace(btrim(l.location), '\\s+', ' ', 'g')) = ${query.location}`,
    );
  }

  // Sort + keyset. Only these whitelisted orderings are ever emitted; the
  // client never supplies a column name.
  let orderBy: Prisma.Sql;
  let rankSelect: Prisma.Sql = Prisma.empty;
  switch (query.sort) {
    case 'price_asc':
      orderBy = Prisma.sql`l.price_minor ASC, l.id ASC`;
      if (cur) {
        conds.push(
          Prisma.sql`(l.price_minor, l.id) > (${Number(cur.sortValue)}, ${cur.id}::uuid)`,
        );
      }
      break;
    case 'price_desc':
      orderBy = Prisma.sql`l.price_minor DESC, l.id DESC`;
      if (cur) {
        conds.push(
          Prisma.sql`(l.price_minor, l.id) < (${Number(cur.sortValue)}, ${cur.id}::uuid)`,
        );
      }
      break;
    case 'relevance': {
      // Cast to double precision so the rank carried in the cursor round-trips
      // losslessly (ts_rank is float4; promoting to double is lossless and
      // avoids truncation). Equal ranks fall through to the id tiebreaker.
      const rank = Prisma.sql`ts_rank(l.search_vector, websearch_to_tsquery('simple', ${query.q ?? ''}))::double precision`;
      rankSelect = Prisma.sql`, ${rank} AS "rank"`;
      orderBy = Prisma.sql`"rank" DESC, l.id DESC`;
      if (cur) {
        conds.push(
          Prisma.sql`(${rank}, l.id) < (${Number(cur.sortValue)}::double precision, ${cur.id}::uuid)`,
        );
      }
      break;
    }
    case 'newest':
    default:
      orderBy = Prisma.sql`l.created_at DESC, l.id DESC`;
      if (cur) {
        conds.push(
          Prisma.sql`(l.created_at, l.id) < (${new Date(cur.sortValue)}, ${cur.id}::uuid)`,
        );
      }
      break;
  }

  const where = Prisma.join(conds, ' AND ');
  const rows = await timeSpan('db.browse', () =>
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT l.id,
             l.slug,
             l.title,
             l.brand,
             l.size,
             l.condition::text AS "condition",
             l.gender::text AS "gender",
             l.price_minor AS "priceMinor",
             l.currency,
             c.slug AS "categorySlug",
             c.name AS "categoryName",
             (SELECT i.storage_key FROM listing_images i
                WHERE i.listing_id = l.id
                ORDER BY i.position ASC, i.created_at ASC
                LIMIT 1) AS "coverKey",
             l.created_at AS "createdAt"${rankSelect}
      FROM listings l
      LEFT JOIN categories c ON c.id = l.category_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${take + 1}
    `),
  );

  const hasMore = rows.length > take;
  const items = rows.slice(0, take);
  const signed = await signCovers(
    items.map((r) => r.coverKey).filter((k): k is string => Boolean(k)),
  );

  const cards: PublicListingCard[] = items.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    size: r.size,
    condition: r.condition,
    gender: r.gender,
    priceMinor: r.priceMinor,
    currency: r.currency,
    categorySlug: r.categorySlug,
    categoryName: r.categoryName,
    coverUrl: r.coverKey ? (signed.get(r.coverKey) ?? null) : null,
  }));

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]!;
    const sortValue =
      query.sort === 'newest'
        ? last.createdAt.toISOString()
        : query.sort === 'relevance'
          ? String(last.rank ?? 0)
          : String(last.priceMinor ?? 0);
    nextCursor = encodeCursor({
      v: 1,
      sort: query.sort,
      sortValue,
      id: last.id,
      fp,
    });
  }

  return { items: cards, nextCursor };
}

/** Raw row for the single-query public-detail read (images arrive as JSON). */
interface PublicDetailRawRow {
  id: string;
  slug: string | null;
  title: string;
  brand: string | null;
  size: string | null;
  color: string | null;
  material: string | null;
  condition: string | null;
  gender: string;
  priceMinor: number | null;
  originalPriceMinor: number | null;
  currency: string;
  description: string | null;
  location: string | null;
  deliveryMethod: string;
  deliveryNote: string | null;
  createdAt: Date;
  categorySlug: string | null;
  categoryName: string | null;
  sellerHandle: string;
  sellerShopName: string;
  sellerJoinedAt: Date;
  images: { storageKey: string; width: number; height: number }[];
}

/**
 * Read one published listing detail in a SINGLE query (listing + category +
 * seller joined; gallery via a `json_agg` subquery), then batch-sign the images
 * once. Replaces the previous Prisma nested `findFirst`, which issued TWO round
 * trips (main row + a separate images query); collapsing to ONE round-trip is
 * ~2.2x faster on the same pooler (measured, prod). Published-only filtering,
 * DTO privacy, and the single batched sign are preserved; `${predicate}` is a
 * parameterized equality on the already-validated slug or id.
 */
async function fetchPublicDetail(
  predicate: Prisma.Sql,
  span: string,
): Promise<PublicListingDetail | null> {
  const rows = await timeSpan(span, () =>
    prisma.$queryRaw<PublicDetailRawRow[]>(Prisma.sql`
      SELECT l.id,
             l.slug,
             l.title,
             l.brand,
             l.size,
             l.color,
             l.material,
             l.condition::text AS "condition",
             l.gender::text AS "gender",
             l.price_minor AS "priceMinor",
             l.original_price_minor AS "originalPriceMinor",
             l.currency,
             l.description,
             l.location,
             l.delivery_method::text AS "deliveryMethod",
             l.delivery_note AS "deliveryNote",
             l.created_at AS "createdAt",
             c.slug AS "categorySlug",
             c.name AS "categoryName",
             s.handle AS "sellerHandle",
             s.shop_name AS "sellerShopName",
             s.created_at AS "sellerJoinedAt",
             COALESCE(
               (SELECT json_agg(json_build_object(
                          'storageKey', i.storage_key,
                          'width', i.width,
                          'height', i.height)
                        ORDER BY i.position ASC, i.created_at ASC)
                FROM listing_images i WHERE i.listing_id = l.id),
               '[]'::json
             ) AS "images"
      FROM listings l
      LEFT JOIN categories c ON c.id = l.category_id
      JOIN seller_profiles s ON s.id = l.seller_id
      WHERE l.status = 'published' AND ${predicate}
      LIMIT 1
    `),
  );
  const r = rows[0];
  if (!r) return null;

  const images = Array.isArray(r.images) ? r.images : [];
  const signed = await signCovers(images.map((i) => i.storageKey));
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    size: r.size,
    condition: r.condition,
    gender: r.gender,
    priceMinor: r.priceMinor,
    currency: r.currency,
    categorySlug: r.categorySlug,
    categoryName: r.categoryName,
    coverUrl: images[0] ? (signed.get(images[0].storageKey) ?? null) : null,
    description: r.description,
    color: r.color,
    material: r.material,
    location: r.location,
    deliveryMethod: r.deliveryMethod,
    deliveryNote: r.deliveryNote,
    originalPriceMinor: r.originalPriceMinor,
    createdAt: r.createdAt,
    seller: {
      handle: r.sellerHandle,
      shopName: r.sellerShopName,
      joinedAt: r.sellerJoinedAt,
    },
    images: images
      .map((i) => ({
        url: signed.get(i.storageKey) ?? '',
        width: i.width,
        height: i.height,
      }))
      .filter((i) => i.url),
  };
}

/**
 * A single published listing by id (else null -> caller renders not-found).
 * Request-memoized so generateMetadata + the page render share ONE query.
 * Retained so `/listing/[id]` keeps resolving; the canonical PDP reads by slug.
 */
export const getPublicListing = cache(
  async (id: string): Promise<PublicListingDetail | null> => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return cachedCatalog(`detail-id:${id}`, () =>
      fetchPublicDetail(Prisma.sql`l.id = ${id}::uuid`, 'db.listingById'),
    );
  },
);

/**
 * A single published listing by its stable public slug (else null). The
 * canonical read for /products/[slug]. Request-memoized so generateMetadata +
 * the page render share ONE query.
 */
export const getPublicListingBySlug = cache(
  async (slug: string): Promise<PublicListingDetail | null> => {
    const s = slug.trim().toLowerCase();
    if (!s || s.length > 200) return null;
    return cachedCatalog(`detail-slug:${s}`, () =>
      fetchPublicDetail(Prisma.sql`l.slug = ${s}`, 'db.listingBySlug'),
    );
  },
);

/** Ranking inputs for related products (all public, taken from the PDP DTO). */
export interface RelatedQuery {
  listingId: string;
  brand: string | null;
  categorySlug: string | null;
  size: string | null;
  priceMinor: number | null;
}

/**
 * Up to `limit` OTHER published listings related to the given one, ranked
 * deterministically:
 *   1. same brand, 2. same category, 3. same size, 4. nearest price,
 *   5. newest, 6. id tie-break.
 * The current listing is excluded and only published rows are considered, so a
 * listing can never appear through any duplicate path. ONE bounded query
 * (`LIMIT`), covers batch-signed in ONE round-trip — no N+1.
 */
export async function getRelatedListings(
  q: RelatedQuery,
  limit = 8,
): Promise<PublicListingCard[]> {
  const key = `related:${q.listingId}:${q.brand ?? ''}:${q.categorySlug ?? ''}:${q.size ?? ''}:${q.priceMinor ?? ''}:${limit}`;
  return cachedCatalog(key, () => getRelatedListingsUncached(q, limit));
}

async function getRelatedListingsUncached(
  q: RelatedQuery,
  limit: number,
): Promise<PublicListingCard[]> {
  const rows = await timeSpan('db.related', () =>
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT l.id,
             l.slug,
             l.title,
             l.brand,
             l.size,
             l.condition::text AS "condition",
             l.gender::text AS "gender",
             l.price_minor AS "priceMinor",
             l.currency,
             c.slug AS "categorySlug",
             c.name AS "categoryName",
             (SELECT i.storage_key FROM listing_images i
                WHERE i.listing_id = l.id
                ORDER BY i.position ASC, i.created_at ASC
                LIMIT 1) AS "coverKey",
             l.created_at AS "createdAt"
      FROM listings l
      LEFT JOIN categories c ON c.id = l.category_id
      WHERE l.status = 'published' AND l.id <> ${q.listingId}::uuid
      ORDER BY
        COALESCE(${q.brand}::text IS NOT NULL AND l.brand = ${q.brand}, false) DESC,
        COALESCE(${q.categorySlug}::text IS NOT NULL AND c.slug = ${q.categorySlug}, false) DESC,
        COALESCE(${q.size}::text IS NOT NULL AND l.size = ${q.size}, false) DESC,
        ABS(COALESCE(l.price_minor, 0) - ${q.priceMinor ?? 0}) ASC,
        l.created_at DESC,
        l.id DESC
      LIMIT ${limit}
    `),
  );

  const signed = await signCovers(
    rows.map((r) => r.coverKey).filter((k): k is string => Boolean(k)),
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    brand: r.brand,
    size: r.size,
    condition: r.condition,
    gender: r.gender,
    priceMinor: r.priceMinor,
    currency: r.currency,
    categorySlug: r.categorySlug,
    categoryName: r.categoryName,
    coverUrl: r.coverKey ? (signed.get(r.coverKey) ?? null) : null,
  }));
}

export interface PublicSellerPage {
  profile: PublicSellerProfile;
  listings: PublicListingPage;
}

/** Internal seller row (includes the id used only to scope queries). */
interface ResolvedSeller {
  id: string;
  handle: string;
  shopName: string;
  joinedAt: Date;
}

/**
 * Resolve a seller by public handle. Request-MEMOIZED so a page and its
 * `generateMetadata` share ONE seller query. The internal id is used only to
 * scope listing/count queries and is NEVER returned to a client surface.
 */
export const resolvePublicSeller = cache(
  async (handle: string): Promise<ResolvedSeller | null> => {
    // Instrumented (PERF_TRACE): exactly ONE `db.sellerResolve` span per request
    // proves generateMetadata + the page render share this memoized query.
    return cachedCatalog(`seller:${normalizeHandle(handle)}`, () =>
      timeSpan('db.sellerResolve', async () => {
        const seller = await prisma.sellerProfile.findUnique({
          where: { handle: normalizeHandle(handle) },
          select: { id: true, handle: true, shopName: true, createdAt: true },
        });
        if (!seller) return null;
        return {
          id: seller.id,
          handle: seller.handle,
          shopName: seller.shopName,
          joinedAt: seller.createdAt,
        };
      }),
    );
  },
);

/** Public-safe projection (drops the internal id). */
export function toPublicSellerProfile(s: ResolvedSeller): PublicSellerProfile {
  return { handle: s.handle, shopName: s.shopName, joinedAt: s.joinedAt };
}

/** Count of a seller's PUBLISHED listings (for the storefront statistics). */
export async function countSellerPublishedListings(
  sellerId: string,
): Promise<number> {
  return cachedCatalog(`count:${sellerId}`, () =>
    prisma.listing.count({
      where: { sellerId, status: 'published' },
    }),
  );
}

/**
 * A public seller profile by handle + their published catalogue. Returns null
 * if the handle is unknown. The seller's internal id is used only to scope the
 * listing query — it is never returned.
 */
export async function getPublicSeller(
  handle: string,
  query: BrowseQuery,
): Promise<PublicSellerPage | null> {
  const seller = await resolvePublicSeller(handle);
  if (!seller) return null;

  const listings = await listPublishedListings(query, {
    sellerId: seller.id,
  });
  return { profile: toPublicSellerProfile(seller), listings };
}
