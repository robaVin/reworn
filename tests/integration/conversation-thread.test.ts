import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StorageAdapter } from '@/modules/catalog/storage';

/**
 * Conversation-thread integration: the read-only thread relies on the 3A
 * participant-authorized DTO (`getConversationForCurrentUser`) for context and
 * the new `listRecentConversationMessages` for history (newest page first,
 * ascending within the window, keyset backward). Validates authorization,
 * non-public/removed context, deterministic ordering, and no dup/skip paging.
 */

const SELLER = 'aa111111-1111-1111-1111-111111111111';
const BUYER = 'aa222222-2222-2222-2222-222222222222';
const OTHER = 'aa333333-3333-3333-3333-333333333333';

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

async function publish(title: string, status = 'published'): Promise<string> {
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
      status: status as 'published',
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  return row.id;
}

async function startConversation(listingId: string): Promise<string> {
  const { id } = await svc.getOrCreateConversationForListing(BUYER, listingId);
  return id;
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-thread-'));
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
    data: [{ id: SELLER }, { id: BUYER }, { id: OTHER }],
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER, roleId: sellerRole.id },
      { profileId: BUYER, roleId: buyerRole.id },
      { profileId: OTHER, roleId: buyerRole.id },
    ],
    skipDuplicates: true,
  });
  const seller = await prisma.sellerProfile.create({
    data: {
      profileId: SELLER,
      shopName: 'Thread Shop',
      status: 'active',
      handle: 'thread-shop',
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

describe('authorization + not-found', () => {
  let conv: string;
  beforeAll(async () => {
    conv = await startConversation(await publish('Authz item'));
    await svc.sendConversationMessage(BUYER, conv, 'hi');
  });

  it('both participants can load context; a third user, unknown, and malformed all get null', async () => {
    expect(await svc.getConversationForCurrentUser(BUYER, conv)).not.toBeNull();
    expect(
      await svc.getConversationForCurrentUser(SELLER, conv),
    ).not.toBeNull();
    expect(await svc.getConversationForCurrentUser(OTHER, conv)).toBeNull();
    expect(
      await svc.getConversationForCurrentUser(
        BUYER,
        '00000000-0000-0000-0000-000000000000',
      ),
    ).toBeNull();
    expect(
      await svc.getConversationForCurrentUser(BUYER, 'not-a-uuid'),
    ).toBeNull();
  });

  it('a third user cannot list the thread messages (uniform not-found)', async () => {
    await expect(
      svc.listRecentConversationMessages(OTHER, conv),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      svc.listRecentConversationMessages(BUYER, 'not-a-uuid'),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('non-public + removed context stays accessible to participants', () => {
  it('published / paused / archived contexts load with the right status', async () => {
    for (const status of ['published', 'paused', 'archived'] as const) {
      const listing = await publish(`Ctx ${status}`, 'published');
      const conv = await startConversation(listing);
      if (status !== 'published') {
        await prisma.listing.update({
          where: { id: listing },
          data: { status },
        });
      }
      const ctx = await svc.getConversationForCurrentUser(BUYER, conv);
      expect(ctx).not.toBeNull();
      expect(ctx!.listing.status).toBe(status);
      // Only a published listing exposes a live id for a public link.
      if (status === 'published') expect(ctx!.listing.id).toBe(listing);
    }
  });

  it('a removed listing uses the snapshot (null id, removed status, no cover)', async () => {
    const listing = await publish('Ctx removed');
    const conv = await startConversation(listing);
    await svc.sendConversationMessage(BUYER, conv, 'still around?');
    await prisma.listing.delete({ where: { id: listing } });
    const ctx = await svc.getConversationForCurrentUser(BUYER, conv);
    expect(ctx!.listing.id).toBeNull();
    expect(ctx!.listing.status).toBe('removed');
    expect(ctx!.listing.title).toBe('Ctx removed');
    expect(ctx!.listing.coverUrl).toBeNull();
  });
});

describe('signed cover for thread context', () => {
  it('signs a live cover in ONE batch; no call when there is no cover', async () => {
    const withImg = await publish('Ctx cover');
    await prisma.listingImage.create({
      data: {
        listingId: withImg,
        storageKey: `${withImg}/cover.webp`,
        position: 0,
        width: 800,
        height: 1000,
        byteSize: 999,
        mimeType: 'image/webp',
      },
    });
    const conv = await startConversation(withImg);

    const before = defaultStorage.signCalls;
    const ctx = await svc.getConversationForCurrentUser(BUYER, conv);
    expect(defaultStorage.signCalls - before).toBe(1);
    expect(ctx!.listing.coverUrl).toMatch(
      new RegExp(`^signed://${withImg}/cover\\.webp\\?ttl=\\d+$`),
    );

    const noImg = await startConversation(await publish('Ctx no cover'));
    const before2 = defaultStorage.signCalls;
    const ctx2 = await svc.getConversationForCurrentUser(BUYER, noImg);
    expect(defaultStorage.signCalls - before2).toBe(0); // no eligible cover
    expect(ctx2!.listing.coverUrl).toBeNull();
  });
});

describe('recent messages — newest page first, ascending, keyset backward', () => {
  it('paginates 31 messages with no duplicates or skips', async () => {
    const conv = await startConversation(await publish('Paged thread'));
    const total = svc.MESSAGES_PAGE_SIZE + 1; // 31 -> forces a second page
    const ids: string[] = [];
    for (let i = 0; i < total; i++) {
      const m = await prisma.message.create({
        data: {
          conversationId: conv,
          senderProfileId: BUYER,
          body: `m${i}`,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        },
        select: { id: true },
      });
      ids.push(m.id);
    }

    const page1 = await svc.listRecentConversationMessages(BUYER, conv);
    expect(page1.items).toHaveLength(svc.MESSAGES_PAGE_SIZE);
    expect(page1.olderCursor).toBeTruthy();
    // Ascending within the window; the newest message is last.
    const t1 = page1.items.map((m) => m.createdAt.getTime());
    expect(t1).toEqual([...t1].sort((a, b) => a - b));
    expect(page1.items[page1.items.length - 1]!.id).toBe(ids[ids.length - 1]);

    const page2 = await svc.listRecentConversationMessages(
      BUYER,
      conv,
      page1.olderCursor ?? undefined,
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.olderCursor).toBeNull();
    expect(page2.items[0]!.id).toBe(ids[0]); // the very oldest

    // Union == all, no overlap.
    const seen = [...page1.items, ...page2.items].map((m) => m.id);
    expect(new Set(seen).size).toBe(total);
    expect(seen.sort()).toEqual([...ids].sort());
  });

  it('breaks equal timestamps deterministically by id (ascending window)', async () => {
    const conv = await startConversation(await publish('Tie thread'));
    const ts = new Date('2026-02-01T00:00:00.000Z');
    const idLow = 'bb000000-0000-0000-0000-0000000000aa';
    const idHigh = 'bb000000-0000-0000-0000-0000000000ee';
    await prisma.message.create({
      data: {
        id: idHigh,
        conversationId: conv,
        senderProfileId: BUYER,
        body: 'high',
        createdAt: ts,
      },
    });
    await prisma.message.create({
      data: {
        id: idLow,
        conversationId: conv,
        senderProfileId: BUYER,
        body: 'low',
        createdAt: ts,
      },
    });
    const page = await svc.listRecentConversationMessages(BUYER, conv);
    const iLow = page.items.findIndex((m) => m.id === idLow);
    const iHigh = page.items.findIndex((m) => m.id === idHigh);
    expect(iLow).toBeGreaterThanOrEqual(0);
    expect(iLow).toBeLessThan(iHigh); // low id first at equal ts
  });

  it('ignores a cursor minted for a DIFFERENT conversation (returns own newest page)', async () => {
    const convA = await startConversation(await publish('Cursor A'));
    for (let i = 0; i < svc.MESSAGES_PAGE_SIZE + 1; i++) {
      await prisma.message.create({
        data: {
          conversationId: convA,
          senderProfileId: BUYER,
          body: `A${i}`,
          createdAt: new Date(Date.UTC(2026, 2, 1, 0, 0, i)),
        },
      });
    }
    const aCursor = (await svc.listRecentConversationMessages(BUYER, convA))
      .olderCursor;
    expect(aCursor).toBeTruthy();

    const convB = await startConversation(await publish('Cursor B'));
    await svc.sendConversationMessage(BUYER, convB, 'only B message');

    // A's cursor is bound to conv A; against B it is rejected -> B's first page.
    const bPage = await svc.listRecentConversationMessages(
      BUYER,
      convB,
      aCursor ?? undefined,
    );
    expect(bPage.items).toHaveLength(1);
    expect(bPage.items[0]!.body).toBe('only B message');
  });
});

describe('thread DTO privacy', () => {
  it('serialized context + messages expose no ids/emails/internals', async () => {
    const conv = await startConversation(await publish('Privacy thread'));
    await svc.sendConversationMessage(BUYER, conv, 'hello privacy');
    const context = await svc.getConversationForCurrentUser(BUYER, conv);
    const messages = await svc.listRecentConversationMessages(BUYER, conv);
    const blob = JSON.stringify({ context, messages });
    for (const id of [BUYER, SELLER, OTHER, sellerProfileId]) {
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
