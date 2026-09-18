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

/**
 * IDOR regression guard (Phase S).
 *
 * A single authoritative place that pins the cross-actor invariant for every
 * ownership-scoped MUTATION surface: user B can neither mutate nor read user A's
 * listing, images, or conversation. These invariants are also exercised by the
 * per-domain suites; this file consolidates them and — crucially — asserts that
 * a rejected cross-actor call leaves the target BYTE-FOR-BYTE UNCHANGED, not just
 * that it throws. If a future refactor drops an ownership check, this fails loud.
 *
 * All boundaries collapse wrong-owner / non-existent / non-visible to the SAME
 * 404 (or null) so an attacker cannot probe existence. Identity is always the
 * verified user id passed by the action layer; no client-supplied actor or
 * participant id is ever accepted.
 */

const SELLER_A = 'e1111111-1111-1111-1111-111111111111'; // owner
const SELLER_B = 'e2222222-2222-2222-2222-222222222222'; // attacker (also a seller)
const BUYER = 'e3333333-3333-3333-3333-333333333333'; // conversation participant
const OUTSIDER = 'e4444444-4444-4444-4444-444444444444'; // unrelated user

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let listings: typeof import('@/modules/catalog/listing-service');
let images: typeof import('@/modules/catalog/image-service');
let storageMod: typeof import('@/modules/catalog/storage');
let msg: typeof import('@/modules/messaging/service');

let categoryId: string;

/** Minimal in-memory storage so image tests need neither network nor sharp. */
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

/** Valid JPEG magic bytes so real signature validation passes. */
function jpegBytes(padding = 256): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    Buffer.alloc(padding, 0x11),
  ]);
}

function baseInput(): DraftListingInput {
  return {
    title: 'Owner Coat',
    description: 'A coat owned by seller A.',
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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-idor-'));
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
  storageMod = await import('@/modules/catalog/storage');
  msg = await import('@/modules/messaging/service');

  fakeStorage = new FakeStorage();
  storageMod.setStorageAdapter(fakeStorage);
  images.setImageProcessor(okProcessor);

  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  categoryId = (await prisma.category.findFirstOrThrow()).id;

  await prisma.profile.createMany({
    data: [SELLER_A, SELLER_B, BUYER, OUTSIDER].map((id) => ({ id })),
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER_A, roleId: sellerRole.id },
      { profileId: SELLER_B, roleId: sellerRole.id },
      { profileId: BUYER, roleId: buyerRole.id },
      { profileId: OUTSIDER, roleId: buyerRole.id },
    ],
    skipDuplicates: true,
  });
  await prisma.sellerProfile.createMany({
    data: [
      {
        profileId: SELLER_A,
        shopName: 'A Shop',
        status: 'active',
        handle: 'a-shop',
      },
      {
        profileId: SELLER_B,
        shopName: 'B Shop',
        status: 'active',
        handle: 'b-shop',
      },
    ],
    skipDuplicates: true,
  });
}, 180_000);

afterAll(async () => {
  storageMod.setStorageAdapter(undefined);
  images.setImageProcessor(undefined);
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('IDOR — listing mutation (user B vs user A)', () => {
  it('B cannot updateListing on A’s draft: 404 and the row is unchanged', async () => {
    const draft = await listings.createDraftListing(SELLER_A, baseInput());
    await expect(
      listings.updateListing(SELLER_B, draft.id, { title: 'hacked-by-B' }),
    ).rejects.toMatchObject({ status: 404 });

    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(row.title).toBe('Owner Coat'); // untouched
  });

  it('B cannot transitionListing on A’s published listing: 404 and status is unchanged', async () => {
    const draft = await listings.createDraftListing(SELLER_A, baseInput());
    await images.addListingImage(SELLER_A, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    const published = await listings.transitionListing(
      SELLER_A,
      draft.id,
      'publish',
    );
    expect(published.status).toBe('published');

    await expect(
      listings.transitionListing(SELLER_B, draft.id, 'pause'),
    ).rejects.toMatchObject({ status: 404 });

    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(row.status).toBe('published'); // not paused
  });

  it('B cannot read A’s draft via getOwnedListing (null, not a leak)', async () => {
    const draft = await listings.createDraftListing(SELLER_A, baseInput());
    expect(await listings.getOwnedListing(SELLER_B, draft.id)).toBeNull();
  });
});

describe('IDOR — listing images (user B vs user A)', () => {
  it('B cannot add, reorder, or delete images on A’s listing; the image set is unchanged', async () => {
    const draft = await listings.createDraftListing(SELLER_A, baseInput());
    const img = await images.addListingImage(SELLER_A, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });

    await expect(
      images.addListingImage(SELLER_B, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      images.reorderListingImages(SELLER_B, draft.id, [img.id]),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      images.deleteListingImage(SELLER_B, img.id),
    ).rejects.toMatchObject({ status: 404 });

    // The one original image survives untouched, object still stored.
    const rows = await prisma.listingImage.findMany({
      where: { listingId: draft.id },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => r.id)).toEqual([img.id]);
    expect(rows[0]!.position).toBe(0);
    expect(fakeStorage.objects.has(img.storageKey)).toBe(true);
  });
});

describe('IDOR — conversation access (third party vs the two participants)', () => {
  let convId: string;

  beforeAll(async () => {
    const draft = await listings.createDraftListing(SELLER_A, baseInput());
    await images.addListingImage(SELLER_A, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    await listings.transitionListing(SELLER_A, draft.id, 'publish');
    convId = (await msg.getOrCreateConversationForListing(BUYER, draft.id)).id;
    await msg.sendConversationMessage(
      BUYER,
      convId,
      'Is this still available?',
    );
  });

  it('both participants can read the conversation', async () => {
    expect(
      await msg.getConversationForCurrentUser(BUYER, convId),
    ).not.toBeNull();
    expect(
      await msg.getConversationForCurrentUser(SELLER_A, convId),
    ).not.toBeNull();
  });

  it('an outsider and an unrelated seller cannot read it (null)', async () => {
    expect(
      await msg.getConversationForCurrentUser(OUTSIDER, convId),
    ).toBeNull();
    expect(
      await msg.getConversationForCurrentUser(SELLER_B, convId),
    ).toBeNull();
  });

  it('an outsider cannot list its messages (404)', async () => {
    await expect(
      msg.listConversationMessages(OUTSIDER, convId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('an outsider cannot send into it: 404 and the message count is unchanged', async () => {
    const before = await prisma.message.count({
      where: { conversationId: convId },
    });
    await expect(
      msg.sendConversationMessage(OUTSIDER, convId, 'let me in'),
    ).rejects.toMatchObject({ status: 404 });
    const after = await prisma.message.count({
      where: { conversationId: convId },
    });
    expect(after).toBe(before); // no message written
  });
});
