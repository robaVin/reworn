import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from '@/modules/catalog/storage';
import type { ProcessedImage } from '@/modules/catalog/image-processing';
import type { DraftListingInput } from '@/modules/catalog/schemas';
import { invalidateCatalog, __catalogCacheSize } from '@/lib/catalog-cache';

/**
 * Cache-isolation regression guard (Phase S).
 *
 * The in-process catalog cache (src/lib/catalog-cache.ts) is for ANONYMOUS,
 * NON-user-specific public reads only. This suite proves — against a real DB —
 * that authenticated/user-scoped data is NEVER served from, nor written into,
 * that shared cache, so one viewer's private view can never leak to another:
 *
 *  1. Authenticated read paths (getOwnedListing / getListingForViewer) neither
 *     read nor populate the public cache.
 *  2. The public cache is keyed only by public identifiers (never a viewer id),
 *     so repeated public reads share ONE identity-free entry.
 *  3. An owner's authenticated view of a non-public (draft) listing never leaks
 *     into the public path — the public read still returns null.
 *  4. An authenticated read of a published listing is not handed the cached
 *     PUBLIC DTO object; the two paths are distinct.
 */

const SELLER_A = 'f1111111-1111-1111-1111-111111111111'; // owner
const SELLER_B = 'f2222222-2222-2222-2222-222222222222'; // other seller

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let listings: typeof import('@/modules/catalog/listing-service');
let images: typeof import('@/modules/catalog/image-service');
let publicCatalog: typeof import('@/modules/catalog/public-catalog');
let storageMod: typeof import('@/modules/catalog/storage');

let categoryId: string;
let publishedId: string;
let draftId: string;

class FakeStorage implements StorageAdapter {
  objects = new Map<string, Buffer>();
  async upload(key: string, body: Buffer): Promise<void> {
    this.objects.set(key, body);
  }
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) this.objects.delete(k);
  }
  async createSignedUrl(key: string, ttl: number): Promise<string> {
    return `signed://${key}?ttl=${ttl}`;
  }
  async createSignedUrls(
    keys: string[],
    ttl: number,
  ): Promise<Map<string, string>> {
    return new Map(keys.map((k) => [k, `signed://${k}?ttl=${ttl}`]));
  }
  async list(): Promise<{ key: string; createdAt: Date | null }[]> {
    return [...this.objects.keys()].map((key) => ({ key, createdAt: null }));
  }
}
let fakeStorage: FakeStorage;

const okProcessor = async (): Promise<ProcessedImage> => ({
  buffer: Buffer.from('processed-webp-bytes'),
  width: 1200,
  height: 1200,
  byteSize: 20,
  mimeType: 'image/webp',
});

function jpegBytes(padding = 256): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    Buffer.alloc(padding, 0x11),
  ]);
}

function baseInput(): DraftListingInput {
  return {
    title: 'Cache Coat',
    description: 'A coat for the cache-isolation suite.',
    categoryId,
    size: 'M',
    condition: 'very_good',
    gender: 'unisex',
    priceMinor: 24000,
    currency: 'MKD',
    location: 'Skopje',
  };
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-cacheiso-'));
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
  listings = await import('@/modules/catalog/listing-service');
  images = await import('@/modules/catalog/image-service');
  publicCatalog = await import('@/modules/catalog/public-catalog');
  storageMod = await import('@/modules/catalog/storage');

  fakeStorage = new FakeStorage();
  storageMod.setStorageAdapter(fakeStorage);
  images.setImageProcessor(okProcessor);

  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  categoryId = (await prisma.category.findFirstOrThrow()).id;

  await prisma.profile.createMany({
    data: [SELLER_A, SELLER_B].map((id) => ({ id })),
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER_A, roleId: sellerRole.id },
      { profileId: SELLER_B, roleId: sellerRole.id },
    ],
    skipDuplicates: true,
  });
  await prisma.sellerProfile.createMany({
    data: [
      {
        profileId: SELLER_A,
        shopName: 'A Shop',
        status: 'active',
        handle: 'cache-a-shop',
      },
      {
        profileId: SELLER_B,
        shopName: 'B Shop',
        status: 'active',
        handle: 'cache-b-shop',
      },
    ],
    skipDuplicates: true,
  });

  // One published listing (owned by A) and one draft (owned by A).
  const pub = await listings.createDraftListing(SELLER_A, baseInput());
  await images.addListingImage(SELLER_A, pub.id, {
    bytes: jpegBytes(),
    declaredMime: 'image/jpeg',
  });
  await listings.transitionListing(SELLER_A, pub.id, 'publish');
  publishedId = pub.id;

  draftId = (await listings.createDraftListing(SELLER_A, baseInput())).id;
}, 180_000);

afterAll(async () => {
  storageMod.setStorageAdapter(undefined);
  images.setImageProcessor(undefined);
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('authenticated reads never touch the public catalog cache', () => {
  it('getListingForViewer / getOwnedListing add NO entries to the public cache', async () => {
    invalidateCatalog();
    expect(__catalogCacheSize()).toBe(0);

    // Owner sees their own draft; a non-owner does not — a per-user result the
    // public cache could never produce.
    const ownerDraft = await listings.getListingForViewer(
      { userId: SELLER_A, roles: ['seller'] },
      draftId,
    );
    expect(ownerDraft).not.toBeNull();
    const owned = await listings.getOwnedListing(SELLER_A, publishedId);
    expect(owned).not.toBeNull();
    expect(await listings.getOwnedListing(SELLER_B, publishedId)).toBeNull();

    // None of those authenticated reads wrote to the shared public cache.
    expect(__catalogCacheSize()).toBe(0);
  });
});

describe('the public cache is keyed by public id only, not viewer identity', () => {
  it('repeated public reads of one listing share a single identity-free entry', async () => {
    invalidateCatalog();
    const a = await publicCatalog.getPublicListing(publishedId);
    const b = await publicCatalog.getPublicListing(publishedId);
    expect(a).not.toBeNull();
    // A cache HIT returns the stored object: same reference, proving there is no
    // per-viewer variation of the cached value.
    expect(b).toBe(a);
    expect(__catalogCacheSize()).toBe(1); // exactly one key for this id
  });
});

describe('a non-public listing’s owner view never leaks to the public path', () => {
  it('the public read of a draft returns null even though the owner can see it', async () => {
    invalidateCatalog();
    // Owner CAN see the draft via the authenticated path.
    expect(
      await listings.getListingForViewer(
        { userId: SELLER_A, roles: ['seller'] },
        draftId,
      ),
    ).not.toBeNull();

    // The public path returns null for the same id, and only ever caches that
    // null — never the owner's private view.
    expect(await publicCatalog.getPublicListing(draftId)).toBeNull();
    expect(await publicCatalog.getPublicListing(draftId)).toBeNull();
  });
});

describe('an authenticated read is not served the cached public DTO', () => {
  it('getOwnedListing returns a distinct object from the cached public DTO, and does not grow the cache', async () => {
    invalidateCatalog();
    const pub = await publicCatalog.getPublicListing(publishedId);
    expect(pub).not.toBeNull();
    const sizeAfterPublic = __catalogCacheSize();

    const owned = await listings.getOwnedListing(SELLER_A, publishedId);
    expect(owned).not.toBeNull();
    // Different code path, different object — never the cached public DTO.
    expect(owned as unknown).not.toBe(pub);
    // The authenticated read did not add or replace any cache entry.
    expect(__catalogCacheSize()).toBe(sizeAfterPublic);
  });
});
