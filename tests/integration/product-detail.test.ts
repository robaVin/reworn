import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@/modules/catalog/storage';

/**
 * PDP routing + related-products ranking against REAL PostgreSQL (embedded):
 * canonical by-slug read, related-product ranking/exclusion/limit/batched
 * signing, and the legacy `/listing/[id]` -> `/products/[slug]` redirect module.
 */

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let pub: typeof import('@/modules/catalog/public-catalog');
let storageMod: typeof import('@/modules/catalog/storage');
let legacy: typeof import('@/app/listing/[listingId]/page');

let signBatchCalls = 0;
let signSingleCalls = 0;

class SpyStorage implements StorageAdapter {
  async upload(): Promise<void> {}
  async remove(): Promise<void> {}
  async createSignedUrl(key: string): Promise<string> {
    signSingleCalls += 1;
    return `signed://${key}`;
  }
  async createSignedUrls(keys: string[]): Promise<Map<string, string>> {
    signBatchCalls += 1;
    return new Map(keys.map((k) => [k, `signed://${k}`]));
  }
  async list(): Promise<{ key: string; createdAt: Date | null }[]> {
    return [];
  }
}

let sellerId: string;
let clothingId: string;
let shoesId: string;
let clock = 0;

/** Insert a listing (published by default) directly, satisfying the CHECKs. */
async function mk(over: Record<string, unknown>): Promise<string> {
  clock += 1;
  const status = ((over.status as string) ?? 'published') as never;
  const publishing = status === 'published';
  const createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, clock));
  const row = await prisma.listing.create({
    data: {
      sellerId,
      title: over.title as string,
      brand: (over.brand as string) ?? null,
      size: (over.size as string) ?? (publishing ? 'ONE' : null),
      condition: (over.condition as never) ?? 'good',
      gender: 'unisex',
      priceMinor: (over.priceMinor as number) ?? 1000,
      currency: 'MKD',
      description: publishing ? 'A pre-loved item.' : null,
      location: publishing ? 'Skopje' : null,
      categoryId: (over.categoryId as string) ?? clothingId,
      slug: (over.slug as string) ?? null,
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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-pdp-'));
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
  legacy = await import('@/app/listing/[listingId]/page');
  storageMod.setStorageAdapter(new SpyStorage());

  clothingId = (
    await prisma.category.findFirstOrThrow({ where: { slug: 'clothing' } })
  ).id;
  shoesId = (
    await prisma.category.findFirstOrThrow({ where: { slug: 'shoes' } })
  ).id;

  const prof = await prisma.profile.create({ data: { id: randomUUID() } });
  sellerId = (
    await prisma.sellerProfile.create({
      data: {
        profileId: prof.id,
        shopName: 'PDP Shop',
        handle: 'pdp-shop',
        status: 'active',
      },
      select: { id: true },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('getPublicListingBySlug (canonical read)', () => {
  it('returns a published listing for the exact slug; null otherwise', async () => {
    await mk({ title: 'Findable', slug: 'findable-aaaa1111' });
    const hit = await pub.getPublicListingBySlug('findable-aaaa1111');
    expect(hit?.title).toBe('Findable');

    expect(await pub.getPublicListingBySlug('nope-does-not-exist')).toBeNull();
    expect(await pub.getPublicListingBySlug('bad slug !!')).toBeNull(); // malformed
    // A paused listing keeps its slug but is not public.
    const pausedId = await mk({ title: 'Paused', slug: 'paused-bbbb2222' });
    await prisma.listing.update({
      where: { id: pausedId },
      data: { status: 'paused' },
    });
    expect(await pub.getPublicListingBySlug('paused-bbbb2222')).toBeNull();
  });
});

describe('getRelatedListings ranking', () => {
  it('ranks brand > category > size > nearest price; excludes current + drafts; batches signing', async () => {
    const currentId = await mk({
      title: 'CURRENT',
      brand: 'Curr',
      categoryId: clothingId,
      size: 'M',
      priceMinor: 10000,
    });
    await mk({
      title: 'sameBrand',
      brand: 'Curr',
      categoryId: shoesId,
      size: 'XL',
      priceMinor: 99999,
    });
    await mk({
      title: 'sameCat',
      brand: 'Other',
      categoryId: clothingId,
      size: 'XL',
      priceMinor: 99999,
    });
    await mk({
      title: 'nearPrice',
      brand: 'Other',
      categoryId: shoesId,
      size: 'XL',
      priceMinor: 10500,
    });
    await mk({
      title: 'farPrice',
      brand: 'Other',
      categoryId: shoesId,
      size: 'XL',
      priceMinor: 90000,
    });
    // A draft that WOULD rank first (same brand) must be excluded.
    await mk({
      title: 'draftSameBrand',
      brand: 'Curr',
      status: 'draft',
    });

    signBatchCalls = 0;
    signSingleCalls = 0;
    const related = await pub.getRelatedListings({
      listingId: currentId,
      brand: 'Curr',
      categorySlug: 'clothing',
      size: 'M',
      priceMinor: 10000,
    });
    const titles = related.map((r) => r.title);

    expect(titles).not.toContain('CURRENT'); // current excluded
    expect(titles).not.toContain('draftSameBrand'); // non-public excluded
    expect(titles.indexOf('sameBrand')).toBeLessThan(titles.indexOf('sameCat'));
    expect(titles.indexOf('sameCat')).toBeLessThan(titles.indexOf('nearPrice'));
    expect(titles.indexOf('nearPrice')).toBeLessThan(
      titles.indexOf('farPrice'),
    );
    // No cover images here, so no signing calls at all — and NEVER the per-key path.
    expect(signSingleCalls).toBe(0);
    expect(signBatchCalls).toBeLessThanOrEqual(1); // batched, never N+1
  });

  it('caps results at 8 and tie-breaks equal ranks by newest then id', async () => {
    const seller2 = await prisma.profile.create({ data: { id: randomUUID() } });
    const s2 = await prisma.sellerProfile.create({
      data: {
        profileId: seller2.id,
        shopName: 'Tie Shop',
        handle: 'tie-shop',
        status: 'active',
      },
      select: { id: true },
    });
    const save = sellerId;
    sellerId = s2.id;
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      ids.push(
        await mk({
          title: `tie-${i}`,
          brand: 'Tie',
          categoryId: clothingId,
          size: 'M',
          priceMinor: 5000,
        }),
      );
    }
    sellerId = save;

    const current = ids[0]!;
    const related = await pub.getRelatedListings({
      listingId: current,
      brand: 'Tie',
      categorySlug: 'clothing',
      size: 'M',
      priceMinor: 5000,
    });
    expect(related.length).toBe(8); // capped
    // All same rank -> newest createdAt first (later `clock` = later time).
    const created = await prisma.listing.findMany({
      where: { id: { in: related.map((r) => r.id) } },
      select: { id: true, createdAt: true },
    });
    const byId = new Map(created.map((c) => [c.id, c.createdAt.getTime()]));
    const times = related.map((r) => byId.get(r.id)!);
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted); // strictly newest-first
  });
});

describe('legacy /listing/[id] redirect', () => {
  async function callLegacy(listingId: string): Promise<{ digest?: string }> {
    try {
      await legacy.default({ params: Promise.resolve({ listingId }) });
      return {};
    } catch (e) {
      return e as { digest?: string };
    }
  }

  it('permanently redirects a public listing to its canonical product URL', async () => {
    const id = await mk({ title: 'Legacy', slug: 'legacy-cccc3333' });
    const err = await callLegacy(id);
    expect(String(err.digest)).toContain('NEXT_REDIRECT');
    expect(String(err.digest)).toContain('/products/legacy-cccc3333');
    expect(String(err.digest)).toContain('308'); // permanent
  });

  it('returns not-found for unknown, malformed, and non-public ids (no leak)', async () => {
    const unknown = await callLegacy(randomUUID());
    expect(String(unknown.digest)).toMatch(/NOT_FOUND|404/);
    const malformed = await callLegacy('not-a-uuid');
    expect(String(malformed.digest)).toMatch(/NOT_FOUND|404/);
    const draftId = await mk({ title: 'HiddenLegacy', status: 'draft' });
    const draft = await callLegacy(draftId);
    expect(String(draft.digest)).toMatch(/NOT_FOUND|404/);
  });
});
