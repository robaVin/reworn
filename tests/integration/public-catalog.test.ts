import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@/modules/catalog/storage';
import {
  parseBrowseQuery,
  type BrowseQuery,
} from '@/modules/catalog/browse-query';
import { RESERVED_HANDLES } from '@/modules/catalog/handle';

/**
 * Public marketplace read layer — integration tests against REAL PostgreSQL
 * (embedded), exercising migrations 0011/0012 (handle + search vector + partial
 * indexes) and the public-catalog service: published-only visibility, DTO
 * privacy, every filter, full-text search, sorting, and keyset pagination.
 */

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let pub: typeof import('@/modules/catalog/public-catalog');
let storageMod: typeof import('@/modules/catalog/storage');

class FakeStorage implements StorageAdapter {
  async upload(): Promise<void> {}
  async remove(): Promise<void> {}
  async createSignedUrl(key: string): Promise<string> {
    return `signed://${key}`;
  }
  async createSignedUrls(keys: string[]): Promise<Map<string, string>> {
    return new Map(keys.map((k) => [k, `signed://${k}`]));
  }
  async list(): Promise<{ key: string; createdAt: Date | null }[]> {
    return [];
  }
}

let sellerAId: string;
let sellerBId: string;
let clothingId: string;
let shoesId: string;

/** Build a browse query from raw params, with an optional page size override. */
function q(raw: Record<string, unknown> = {}, pageSize?: number): BrowseQuery {
  const parsed = parseBrowseQuery(raw);
  return pageSize ? { ...parsed, pageSize } : parsed;
}

let clock = 0;
async function mkListing(over: Record<string, unknown>): Promise<string> {
  clock += 1;
  const status = ((over.status as string) ?? 'published') as never;
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, clock));
  const publishing = status === 'published';
  const row = await prisma.listing.create({
    data: {
      sellerId: (over.sellerId as string) ?? sellerAId,
      title: over.title as string,
      brand: (over.brand as string) ?? null,
      // Published listings must be complete (chk_listing_published_complete);
      // defaults use values that don't collide with the filter assertions.
      size: (over.size as string) ?? (publishing ? 'ONE' : null),
      material: (over.material as string) ?? null,
      condition: (over.condition as never) ?? 'good',
      gender: (over.gender as never) ?? 'unisex',
      priceMinor: (over.priceMinor as number) ?? 1000,
      currency: 'MKD',
      description:
        (over.description as string) ??
        (publishing ? 'Pre-loved item in great condition.' : null),
      location: (over.location as string) ?? (publishing ? 'Prilep' : null),
      categoryId: (over.categoryId as string) ?? clothingId,
      status,
      createdAt,
      publishedAt: publishing ? createdAt : null,
    },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-pub-'));
  server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
  });
  await server.initialise();
  await server.start();
  await server.createDatabase('reworn');

  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
  execSync('npx tsx prisma/seed.ts', { stdio: 'pipe', env });

  ({ prisma } = await import('@/lib/db'));
  pub = await import('@/modules/catalog/public-catalog');
  storageMod = await import('@/modules/catalog/storage');
  storageMod.setStorageAdapter(new FakeStorage());

  clothingId = (
    await prisma.category.findFirstOrThrow({ where: { slug: 'clothing' } })
  ).id;
  shoesId = (
    await prisma.category.findFirstOrThrow({ where: { slug: 'shoes' } })
  ).id;

  const profA = await prisma.profile.create({ data: { id: randomUUID() } });
  const profB = await prisma.profile.create({ data: { id: randomUUID() } });
  sellerAId = (
    await prisma.sellerProfile.create({
      data: {
        profileId: profA.id,
        shopName: 'Aurora Vintage',
        handle: 'aurora-vintage',
        status: 'active',
      },
      select: { id: true },
    })
  ).id;
  sellerBId = (
    await prisma.sellerProfile.create({
      data: {
        profileId: profB.id,
        shopName: 'Bee Boutique',
        handle: 'bee-boutique',
        status: 'active',
      },
      select: { id: true },
    })
  ).id;

  // Published spread across category/size/condition/gender/price/location.
  await mkListing({
    title: 'Wool overcoat',
    brand: 'Zegna',
    material: 'wool',
    size: 'M',
    condition: 'very_good',
    gender: 'men',
    priceMinor: 24000,
    location: 'Skopje',
    categoryId: clothingId,
  });
  await mkListing({
    title: 'Silk scarf',
    brand: 'Hermes',
    material: 'silk',
    size: 'OS',
    condition: 'new',
    gender: 'women',
    priceMinor: 8000,
    location: 'Bitola',
    categoryId: clothingId,
  });
  await mkListing({
    title: 'Leather boots',
    brand: 'Dr Martens',
    material: 'leather',
    size: '42',
    condition: 'good',
    gender: 'unisex',
    priceMinor: 12000,
    location: 'Skopje',
    categoryId: shoesId,
  });
  await mkListing({
    title: 'Running shoes',
    brand: 'Nike',
    size: '43',
    condition: 'fair',
    gender: 'men',
    priceMinor: 5000,
    location: 'skopje ',
    categoryId: shoesId,
  });
  await mkListing({
    title: 'Denim jacket',
    description: 'vintage wool lining',
    brand: 'Levis',
    size: 'L',
    condition: 'good',
    gender: 'unisex',
    priceMinor: 15000,
    location: 'Ohrid',
    categoryId: clothingId,
  });
  await mkListing({
    title: 'Summer dress',
    brand: 'Zara',
    size: 'S',
    condition: 'like_new',
    gender: 'women',
    priceMinor: 6000,
    location: 'Skopje',
    categoryId: clothingId,
    sellerId: sellerBId,
  });

  // Non-public — must NEVER appear publicly.
  await mkListing({
    title: 'HIDDEN draft item',
    status: 'draft',
    priceMinor: 100,
  });
  await mkListing({
    title: 'HIDDEN paused item',
    status: 'paused',
    priceMinor: 100,
  });
  await mkListing({
    title: 'HIDDEN archived item',
    status: 'archived',
    priceMinor: 100,
  });

  // A published listing WITH an image (cover), and one WITHOUT.
  const withImg = await mkListing({
    title: 'Photographed coat',
    priceMinor: 9000,
  });
  await prisma.listingImage.create({
    data: {
      listingId: withImg,
      storageKey: `${withImg}/cover.webp`,
      position: 0,
      width: 800,
      height: 1000,
      byteSize: 100,
      mimeType: 'image/webp',
    },
  });
}, 180_000);

afterAll(async () => {
  storageMod?.setStorageAdapter(undefined);
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

const titles = (p: { items: { title: string }[] }) =>
  p.items.map((i) => i.title);

describe('visibility', () => {
  it('lists only published listings', async () => {
    const page = await pub.listPublishedListings(q({}, 50));
    expect(page.items.every((i) => !i.title.startsWith('HIDDEN'))).toBe(true);
    expect(page.items.length).toBe(7);
  });

  it('excludes every non-public status (draft/paused/archived)', async () => {
    const page = await pub.listPublishedListings(q({ q: 'HIDDEN' }, 50));
    expect(page.items).toEqual([]);
  });

  it('getPublicListing returns null for non-public statuses', async () => {
    for (const status of ['draft', 'paused', 'archived'] as const) {
      const row = await prisma.listing.findFirstOrThrow({ where: { status } });
      expect(await pub.getPublicListing(row.id)).toBeNull();
    }
  });

  it('getPublicListing returns null for a non-uuid id', async () => {
    expect(await pub.getPublicListing('not-a-uuid')).toBeNull();
  });

  it('getPublicListing returns a published listing', async () => {
    const row = await prisma.listing.findFirstOrThrow({
      where: { status: 'published', title: 'Wool overcoat' },
    });
    const detail = await pub.getPublicListing(row.id);
    expect(detail?.title).toBe('Wool overcoat');
  });

  it('detail includes signed gallery images when present, empty when not (2D-C)', async () => {
    const withImg = await prisma.listing.findFirstOrThrow({
      where: { status: 'published', title: 'Photographed coat' },
    });
    const d1 = await pub.getPublicListing(withImg.id);
    expect(d1!.images.length).toBe(1);
    expect(d1!.images[0]!.url).toMatch(/^signed:\/\//);

    const noImg = await prisma.listing.findFirstOrThrow({
      where: { status: 'published', title: 'Wool overcoat' },
    });
    const d2 = await pub.getPublicListing(noImg.id);
    expect(d2!.images).toEqual([]);
  });
});

describe('privacy (DTO shape)', () => {
  it('public seller profile exposes only handle, shopName, joinedAt', async () => {
    const res = await pub.getPublicSeller('aurora-vintage', q({}, 50));
    expect(res).toBeTruthy();
    expect(Object.keys(res!.profile).sort()).toEqual([
      'handle',
      'joinedAt',
      'shopName',
    ]);
  });

  it('listing detail seller exposes no private fields', async () => {
    const row = await prisma.listing.findFirstOrThrow({
      where: { status: 'published' },
    });
    const detail = await pub.getPublicListing(row.id);
    expect(Object.keys(detail!.seller).sort()).toEqual([
      'handle',
      'joinedAt',
      'shopName',
    ]);
    expect(JSON.stringify(detail)).not.toContain('profileId');
    expect(JSON.stringify(detail)).not.toContain(sellerAId);
  });

  it('unknown handle → null; lookup is case-insensitive', async () => {
    expect(await pub.getPublicSeller('nobody', q({}, 50))).toBeNull();
    const upper = await pub.getPublicSeller('AURORA-VINTAGE', q({}, 50));
    expect(upper?.profile.handle).toBe('aurora-vintage');
  });
});

describe('filters', () => {
  it('category (slug)', async () => {
    const page = await pub.listPublishedListings(q({ category: 'shoes' }, 50));
    expect(titles(page).sort()).toEqual(['Leather boots', 'Running shoes']);
  });
  it('size (multiple)', async () => {
    const page = await pub.listPublishedListings(q({ size: ['M', 'L'] }, 50));
    expect(titles(page).sort()).toEqual(['Denim jacket', 'Wool overcoat']);
  });
  it('condition (multiple enum)', async () => {
    const page = await pub.listPublishedListings(
      q({ condition: ['new', 'like_new'] }, 50),
    );
    expect(titles(page).sort()).toEqual(['Silk scarf', 'Summer dress']);
  });
  it('gender (single)', async () => {
    const page = await pub.listPublishedListings(q({ gender: 'women' }, 50));
    expect(titles(page).sort()).toEqual(['Silk scarf', 'Summer dress']);
  });
  it('price range (inclusive)', async () => {
    const page = await pub.listPublishedListings(
      q({ minPrice: '6000', maxPrice: '12000' }, 50),
    );
    expect(titles(page).sort()).toEqual([
      'Leather boots',
      'Photographed coat',
      'Silk scarf',
      'Summer dress',
    ]);
  });
  it('location (normalized, trims trailing space + case)', async () => {
    const page = await pub.listPublishedListings(q({ location: 'Skopje' }, 50));
    // "skopje " (trailing space) and "Skopje" both normalize to "skopje"
    expect(titles(page).sort()).toEqual([
      'Leather boots',
      'Running shoes',
      'Summer dress',
      'Wool overcoat',
    ]);
  });
  it('combined filters', async () => {
    const page = await pub.listPublishedListings(
      q({ category: 'clothing', gender: 'women', maxPrice: '7000' }, 50),
    );
    expect(titles(page)).toEqual(['Summer dress']);
  });
});

describe('search', () => {
  it('matches title/brand/material/description', async () => {
    expect(
      titles(await pub.listPublishedListings(q({ q: 'wool' }, 50))).sort(),
    ).toEqual(['Denim jacket', 'Wool overcoat']);
    expect(
      titles(await pub.listPublishedListings(q({ q: 'hermes' }, 50))),
    ).toEqual(['Silk scarf']);
  });
  it('ranks title matches above description matches (relevance)', async () => {
    const page = await pub.listPublishedListings(q({ q: 'wool' }, 50));
    expect(page.items[0]!.title).toBe('Wool overcoat'); // title weight A > description weight D
  });
  it('empty query returns all published (no search predicate)', async () => {
    const page = await pub.listPublishedListings(q({ q: '' }, 50));
    expect(page.items.length).toBe(7);
  });
  it('malformed query does not throw and is safe', async () => {
    const page = await pub.listPublishedListings(
      q({ q: '!!! & | <script>' }, 50),
    );
    expect(Array.isArray(page.items)).toBe(true);
  });
});

describe('sorting', () => {
  it('price_asc / price_desc', async () => {
    const asc = await pub.listPublishedListings(q({ sort: 'price_asc' }, 50));
    const prices = asc.items.map((i) => i.priceMinor!);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const desc = await pub.listPublishedListings(q({ sort: 'price_desc' }, 50));
    const dprices = desc.items.map((i) => i.priceMinor!);
    expect(dprices).toEqual([...dprices].sort((a, b) => b - a));
  });
  it('newest is default and orders by created_at desc', async () => {
    const page = await pub.listPublishedListings(q({}, 3));
    expect(page.items[0]!.title).toBe('Photographed coat'); // created last
  });
});

describe('pagination (keyset)', () => {
  it('pages through all published with no dupes or skips', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 20; i++) {
      const page = await pub.listPublishedListings(
        q({ sort: 'newest', ...(cursor ? { cursor } : {}) }, 3),
      );
      seen.push(...page.items.map((x) => x.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length); // no dupes
    expect(seen.length).toBe(7); // exactly the published set
  });

  it('rejects a cursor when the filters change (resets to first page)', async () => {
    const first = await pub.listPublishedListings(q({ sort: 'newest' }, 3));
    const cursor = first.nextCursor!;
    // Same cursor but a DIFFERENT filter set → cursor invalid → page 1 again.
    const changed = await pub.listPublishedListings(
      q({ sort: 'newest', category: 'shoes', cursor }, 3),
    );
    // Should be the shoes page-1, not a continuation of the unfiltered set.
    expect(
      changed.items.every((i) =>
        ['Leather boots', 'Running shoes'].includes(i.title),
      ),
    ).toBe(true);
  });

  it('an invalid cursor string is treated as first page', async () => {
    const page = await pub.listPublishedListings(
      q({ sort: 'newest', cursor: 'garbage!!' }, 3),
    );
    expect(page.items.length).toBe(3);
  });
});

describe('images', () => {
  it('card has a signed cover when an image exists, null when not', async () => {
    const page = await pub.listPublishedListings(q({ q: 'Photographed' }, 50));
    expect(page.items[0]!.coverUrl).toMatch(/^signed:\/\//);
    const noImg = await pub.listPublishedListings(q({ q: 'scarf' }, 50));
    expect(noImg.items[0]!.coverUrl).toBeNull();
  });
});

describe('seller public catalogue', () => {
  it('returns only that seller’s published listings', async () => {
    const res = await pub.getPublicSeller('bee-boutique', q({}, 50));
    expect(titles(res!.listings)).toEqual(['Summer dress']);
  });
});

describe('schema drift guard (2D-B safeguard)', () => {
  it('migrate deploy creates a GENERATED search_vector column', async () => {
    const rows = await prisma.$queryRaw<{ attgenerated: string }[]>`
      SELECT attgenerated FROM pg_attribute
      WHERE attrelid = 'listings'::regclass AND attname = 'search_vector'`;
    expect(rows.length).toBe(1);
    expect(rows[0]!.attgenerated).toBe('s'); // 's' = STORED generated column
  });

  it('creates all custom browse indexes', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'listings'`;
    const names = rows.map((r) => r.indexname);
    for (const idx of [
      'listings_search_gin',
      'listings_pub_created_idx',
      'listings_pub_price_idx',
      'listings_pub_category_created_idx',
      'listings_pub_location_idx',
    ]) {
      expect(names).toContain(idx);
    }
  });

  it('prisma migrate diff does NOT drop the search_vector column or the partial/functional indexes', () => {
    // Diff FROM the migrated DB TO the schema = what `migrate dev` WOULD do.
    // Because the column is declared Unsupported, Prisma never DROPs it, and it
    // cannot see WHERE-clause (partial/functional) indexes, so it never touches
    // them. It DOES flag the GIN index + generated expression, but those (like
    // RLS/CHECKs since 0002) are owned by the hand-written migration and the
    // project's workflow is `migrate deploy` only (never `migrate dev`).
    const diff = execSync(
      `npx prisma migrate diff --from-url "${url}" --to-schema-datamodel prisma/schema.prisma --script`,
      { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } },
    ).toString();
    expect(diff).not.toMatch(/DROP\s+COLUMN[^;]*search_vector/i);
    expect(diff).not.toMatch(/DROP\s+TABLE[^;]*listings/i);
    for (const idx of [
      'listings_pub_created_idx',
      'listings_pub_price_idx',
      'listings_pub_category_created_idx',
      'listings_pub_location_idx',
    ]) {
      expect(diff).not.toContain(idx); // partial/functional indexes untouched
    }
  });
});

describe('reserved-handle DB/app parity (2D-B safeguard)', () => {
  it('the DB CHECK rejects every app-reserved handle', async () => {
    // Guarantees the database and application reserved lists cannot diverge:
    // anything the app reserves must also be refused by the DB constraint.
    for (const reserved of RESERVED_HANDLES) {
      // Fresh profile per attempt so the ONLY possible violation is the handle
      // CHECK (not the profile_id FK or its unique constraint).
      const p = await prisma.profile.create({ data: { id: randomUUID() } });
      await expect(
        prisma.sellerProfile.create({
          data: {
            profileId: p.id,
            shopName: 'X',
            handle: reserved,
            status: 'active',
          },
        }),
      ).rejects.toThrow();
    }
    // A non-reserved, valid handle inserts fine (control) — proving the
    // rejections above are specifically about the reserved name.
    const ctl = await prisma.profile.create({ data: { id: randomUUID() } });
    await prisma.sellerProfile.create({
      data: {
        profileId: ctl.id,
        shopName: 'Control',
        handle: 'control-shop',
        status: 'active',
      },
    });
  });
});

describe('pagination — equal ranks exercise the id tiebreaker (2D-B safeguard)', () => {
  it('paginates deterministically when many listings share the same rank', async () => {
    // All these titles contain "tiebreak" once → identical ts_rank; only the
    // UUID tiebreaker separates them, so keyset pages must not dupe or skip.
    const prof = await prisma.profile.create({ data: { id: randomUUID() } });
    const seller = await prisma.sellerProfile.create({
      data: {
        profileId: prof.id,
        shopName: 'Tie Shop',
        handle: 'tie-shop',
        status: 'active',
      },
      select: { id: true },
    });
    for (let i = 0; i < 7; i++) {
      await mkListing({ title: `tiebreak item ${i}`, sellerId: seller.id });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const page = await pub.listPublishedListings(
        q(
          { q: 'tiebreak', sort: 'relevance', ...(cursor ? { cursor } : {}) },
          3,
        ),
      );
      seen.push(...page.items.map((x) => x.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length); // no dupes
    expect(seen.length).toBe(7); // all seven, no skips
  });
});

describe('seller storefront (2D-D)', () => {
  it('resolves a seller by valid handle and counts published listings', async () => {
    const res = await pub.getPublicSeller('aurora-vintage', q({}, 50));
    expect(res?.profile.shopName).toBe('Aurora Vintage');
    // Seller A has 6 published listings (dress belongs to seller B).
    expect(res!.listings.items.length).toBe(6);
    const count = await pub.countSellerPublishedListings(sellerAId);
    expect(count).toBe(6);
  });

  it('returns null for unknown and reserved handles', async () => {
    expect(await pub.getPublicSeller('no-such-shop', q({}, 50))).toBeNull();
    expect(await pub.getPublicSeller('admin', q({}, 50))).toBeNull();
    expect(await pub.resolvePublicSeller('shop')).toBeNull();
  });

  it('excludes unpublished listings and reports zero for an empty seller', async () => {
    const prof = await prisma.profile.create({ data: { id: randomUUID() } });
    const empty = await prisma.sellerProfile.create({
      data: {
        profileId: prof.id,
        shopName: 'Empty Shop',
        handle: 'empty-shop',
        status: 'active',
      },
      select: { id: true },
    });
    // Only a draft — nothing public.
    await mkListing({
      title: 'private draft',
      status: 'draft',
      sellerId: empty.id,
    });
    const res = await pub.getPublicSeller('empty-shop', q({}, 50));
    expect(res?.listings.items).toEqual([]);
    expect(await pub.countSellerPublishedListings(empty.id)).toBe(0);
  });

  it('paginates a seller catalogue with no dupes or skips (keyset)', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const res = await pub.getPublicSeller(
        'aurora-vintage',
        q({ ...(cursor ? { cursor } : {}) }, 2),
      );
      seen.push(...res!.listings.items.map((x) => x.id));
      if (!res!.listings.nextCursor) break;
      cursor = res!.listings.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(6);
  });

  it('profile serialization exposes no internal id / private fields', async () => {
    const res = await pub.getPublicSeller('aurora-vintage', q({}, 50));
    expect(Object.keys(res!.profile).sort()).toEqual([
      'handle',
      'joinedAt',
      'shopName',
    ]);
    const json = JSON.stringify(res!.profile);
    expect(json).not.toContain(sellerAId);
    expect(json).not.toContain('profileId');
    expect(json).not.toContain('status');
  });
});
