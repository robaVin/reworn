import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from '@/modules/catalog/storage';

/**
 * Inbox data-layer integration: the /messages page's ONLY data source is the 3A
 * `listConversationSummariesForCurrentUser`. These tests validate what the page
 * relies on — newest-first ordering, keyset pagination, the removed-listing
 * snapshot, one batched cover-signing call, an honest empty inbox, and the DTO
 * privacy contract.
 */

const SELLER = 'f1111111-1111-1111-1111-111111111111';
const BUYER = 'f2222222-2222-2222-2222-222222222222';
const LONELY = 'f3333333-3333-3333-3333-333333333333'; // a user with no conversations

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/messaging/service');
let storageMod: typeof import('@/modules/catalog/storage');

let sellerProfileId: string;
let categoryId: string;
let defaultStorage: CountingStorage;

/** Counts batch-signing calls so the "one call per page" claim is verifiable. */
class CountingStorage implements StorageAdapter {
  signCalls = 0;
  async upload() {}
  async remove() {}
  async createSignedUrl(key: string, ttl: number) {
    return `signed://${key}?ttl=${ttl}`;
  }
  async createSignedUrls(keys: string[], ttl: number) {
    this.signCalls += 1;
    return new Map(keys.map((k) => [k, `signed://${k}?ttl=${ttl}`]));
  }
  async list() {
    return [];
  }
}

async function publish(title: string): Promise<string> {
  const row = await prisma.listing.create({
    data: {
      sellerId: sellerProfileId,
      categoryId,
      title,
      description: 'A test listing.',
      size: 'M',
      condition: 'good',
      gender: 'unisex',
      priceMinor: 10000,
      currency: 'MKD',
      location: 'Skopje',
      status: 'published',
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-inbox-'));
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
  svc = await import('@/modules/messaging/service');
  storageMod = await import('@/modules/catalog/storage');
  // A fake adapter is the default throughout, so cover signing never reaches
  // real Supabase Storage (which is absent in tests).
  defaultStorage = new CountingStorage();
  storageMod.setStorageAdapter(defaultStorage);

  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  const category = await prisma.category.findFirstOrThrow();
  categoryId = category.id;

  await prisma.profile.createMany({
    data: [{ id: SELLER }, { id: BUYER }, { id: LONELY }],
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER, roleId: sellerRole.id },
      { profileId: BUYER, roleId: buyerRole.id },
      { profileId: LONELY, roleId: buyerRole.id },
    ],
    skipDuplicates: true,
  });
  const seller = await prisma.sellerProfile.create({
    data: {
      profileId: SELLER,
      shopName: 'Inbox Shop',
      status: 'active',
      handle: 'inbox-shop',
    },
  });
  sellerProfileId = seller.id;
}, 180_000);

afterAll(async () => {
  storageMod?.setStorageAdapter(undefined);
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('empty inbox', () => {
  it('a user with no conversations gets an empty page and no cursor', async () => {
    const page = await svc.listConversationSummariesForCurrentUser(LONELY);
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });
});

describe('populated inbox — ordering + pagination', () => {
  it('lists newest-activity first and keyset-paginates past the page size', async () => {
    const total = svc.SUMMARIES_PAGE_SIZE + 1; // force a second page
    const ids: string[] = [];
    for (let i = 0; i < total; i++) {
      const listing = await publish(`Item ${i}`);
      const { id } = await svc.getOrCreateConversationForListing(
        BUYER,
        listing,
      );
      // Stagger activity so ordering is deterministic (older i => earlier).
      await prisma.message.create({
        data: {
          conversationId: id,
          senderProfileId: BUYER,
          body: `hello ${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        },
      });
      ids.push(id);
    }

    const first = await svc.listConversationSummariesForCurrentUser(BUYER);
    expect(first.items).toHaveLength(svc.SUMMARIES_PAGE_SIZE);
    expect(first.nextCursor).toBeTruthy();
    // Newest activity first: the LAST-created conversation leads.
    expect(first.items[0]!.id).toBe(ids[ids.length - 1]);
    // Descending activity across the page.
    const times = first.items.map((c) => c.lastActivityAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const second = await svc.listConversationSummariesForCurrentUser(
      BUYER,
      first.nextCursor ?? undefined,
    );
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();

    // No overlap between pages.
    const firstIds = new Set(first.items.map((c) => c.id));
    expect(firstIds.has(second.items[0]!.id)).toBe(false);
  });
});

describe('removed listing', () => {
  it('shows the snapshot title + removed status after the listing is deleted', async () => {
    const listing = await publish('Soon gone');
    const { id } = await svc.getOrCreateConversationForListing(BUYER, listing);
    await svc.sendConversationMessage(BUYER, id, 'still interested?');
    await prisma.listing.delete({ where: { id: listing } });

    const page = await svc.listConversationSummariesForCurrentUser(BUYER);
    const found = page.items.find((c) => c.id === id);
    expect(found).toBeTruthy();
    expect(found!.listing.id).toBeNull();
    expect(found!.listing.status).toBe('removed');
    expect(found!.listing.title).toBe('Soon gone');
  });
});

describe('signed images', () => {
  it('signs all covers on a page in ONE batch call; missing covers are null', async () => {
    const counting = new CountingStorage();
    storageMod.setStorageAdapter(counting);
    try {
      // One conversation WITH a cover image, one WITHOUT.
      const withImg = await publish('Has cover');
      await prisma.listingImage.create({
        data: {
          listingId: withImg,
          storageKey: `${withImg}/cover.webp`,
          position: 0,
          width: 800,
          height: 1000,
          byteSize: 12345,
          mimeType: 'image/webp',
        },
      });
      const c1 = await svc.getOrCreateConversationForListing(BUYER, withImg);
      await svc.sendConversationMessage(BUYER, c1.id, 'cover one');

      const noImg = await publish('No cover');
      const c2 = await svc.getOrCreateConversationForListing(BUYER, noImg);
      await svc.sendConversationMessage(BUYER, c2.id, 'cover none');

      const page = await svc.listConversationSummariesForCurrentUser(BUYER);
      const signed = page.items.find((c) => c.id === c1.id);
      const unsigned = page.items.find((c) => c.id === c2.id);

      expect(signed!.listing.coverUrl).toMatch(
        new RegExp(`^signed://${withImg}/cover\\.webp\\?ttl=\\d+$`),
      );
      expect(unsigned!.listing.coverUrl).toBeNull();
      // Exactly ONE batch signing round-trip for the whole page.
      expect(counting.signCalls).toBe(1);
    } finally {
      storageMod.setStorageAdapter(defaultStorage);
    }
  });
});

describe('DTO privacy', () => {
  it('a serialized summary page exposes no profile ids, emails, or internals', async () => {
    const page = await svc.listConversationSummariesForCurrentUser(BUYER);
    const blob = JSON.stringify(page);
    for (const id of [BUYER, SELLER, LONELY, sellerProfileId]) {
      expect(blob).not.toContain(id);
    }
    for (const key of [
      'buyerProfileId',
      'sellerProfileId',
      'senderProfileId',
      'profileId',
      'email',
      'subscription',
      'payment',
    ]) {
      expect(blob).not.toContain(key);
    }
  });
});
