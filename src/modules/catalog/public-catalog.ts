import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { timeSpan } from '@/lib/perf';
import { getStorageAdapter } from './storage';
import { SIGNED_URL_TTL_SECONDS } from './image-config';
import { normalizeHandle } from './handle';
import { encodeCursor, decodeCursor } from './cursor';
import { filterFingerprint, type BrowseQuery } from './browse-query';

/**
 * Public marketplace read layer. EVERY function here hard-filters
 * `status='published'` and NEVER reads the viewer's identity, so ownership can
 * never widen public visibility. Output is mapped to explicit DTOs that contain
 * only intentionally-public fields — no seller/profile UUIDs, email,
 * subscription, status, or private metadata ever leaves this module.
 */

export interface PublicListingCard {
  id: string;
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
  originalPriceMinor: number | null;
  createdAt: Date;
  seller: PublicSellerProfile;
  images: { url: string; width: number; height: number }[];
}

interface Row {
  id: string;
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
      const rank = Prisma.sql`ts_rank(l.search_vector, websearch_to_tsquery('simple', ${query.q ?? ''}))`;
      rankSelect = Prisma.sql`, ${rank} AS "rank"`;
      orderBy = Prisma.sql`"rank" DESC, l.id DESC`;
      if (cur) {
        conds.push(
          Prisma.sql`(${rank}, l.id) < (${Number(cur.sortValue)}::real, ${cur.id}::uuid)`,
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

/** A single published listing (else null → caller renders not-found). */
export async function getPublicListing(
  id: string,
): Promise<PublicListingDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const listing = await prisma.listing.findFirst({
    where: { id, status: 'published' },
    select: {
      id: true,
      title: true,
      brand: true,
      size: true,
      color: true,
      material: true,
      condition: true,
      gender: true,
      priceMinor: true,
      originalPriceMinor: true,
      currency: true,
      description: true,
      location: true,
      createdAt: true,
      category: { select: { slug: true, name: true } },
      seller: { select: { handle: true, shopName: true, createdAt: true } },
      images: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { storageKey: true, width: true, height: true },
      },
    },
  });
  if (!listing) return null;

  const signed = await signCovers(listing.images.map((i) => i.storageKey));

  return {
    id: listing.id,
    title: listing.title,
    brand: listing.brand,
    size: listing.size,
    condition: listing.condition,
    gender: listing.gender,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    categorySlug: listing.category?.slug ?? null,
    categoryName: listing.category?.name ?? null,
    coverUrl: listing.images[0]
      ? (signed.get(listing.images[0].storageKey) ?? null)
      : null,
    description: listing.description,
    color: listing.color,
    material: listing.material,
    location: listing.location,
    originalPriceMinor: listing.originalPriceMinor,
    createdAt: listing.createdAt,
    seller: {
      handle: listing.seller.handle,
      shopName: listing.seller.shopName,
      joinedAt: listing.seller.createdAt,
    },
    images: listing.images
      .map((i) => ({
        url: signed.get(i.storageKey) ?? '',
        width: i.width,
        height: i.height,
      }))
      .filter((i) => i.url),
  };
}

export interface PublicSellerPage {
  profile: PublicSellerProfile;
  listings: PublicListingPage;
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
  const seller = await prisma.sellerProfile.findUnique({
    where: { handle: normalizeHandle(handle) },
    select: { id: true, handle: true, shopName: true, createdAt: true },
  });
  if (!seller) return null;

  const listings = await listPublishedListings(query, {
    sellerId: seller.id,
  });
  return {
    profile: {
      handle: seller.handle,
      shopName: seller.shopName,
      joinedAt: seller.createdAt,
    },
    listings,
  };
}
