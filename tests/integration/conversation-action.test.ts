import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Integration tests for the conversation-creation ACTION CORE
 * (`resolveStartConversation`) against a real embedded Postgres. The core is the
 * testable seam beneath the `'use server'` action: it takes a verified userId +
 * the client's listingId and returns a redirect target or a safe failure kind,
 * without performing the redirect or reading request context.
 */

const SELLER = 'e1111111-1111-1111-1111-111111111111';
const BUYER = 'e2222222-2222-2222-2222-222222222222';
const OTHER = 'e3333333-3333-3333-3333-333333333333';
const MESSAGES_RE = /^\/messages\/[0-9a-f-]{36}$/i;

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let core: typeof import('@/modules/messaging/conversation-actions');

let sellerProfileId: string;
let categoryId: string;
let publishedId: string;
let draftId: string;
let pausedId: string;
let archivedId: string;

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-convaction-'));
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
  core = await import('@/modules/messaging/conversation-actions');

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
      shopName: 'Action Shop',
      status: 'active',
      handle: 'action-shop',
    },
  });
  sellerProfileId = seller.id;

  const mk = async (status: 'published' | 'draft' | 'paused' | 'archived') => {
    const row = await prisma.listing.create({
      data: {
        sellerId: sellerProfileId,
        categoryId,
        title: `Listing ${status}`,
        description: 'A test listing.',
        size: 'M',
        condition: 'good',
        gender: 'unisex',
        priceMinor: 15000,
        currency: 'MKD',
        location: 'Skopje',
        status,
        ...(status !== 'draft' ? { publishedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    return row.id;
  };
  publishedId = await mk('published');
  draftId = await mk('draft');
  pausedId = await mk('paused');
  archivedId = await mk('archived');
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('resolveStartConversation — buyer happy path', () => {
  it('creates a conversation and redirects to /messages/[id]', async () => {
    const out = await core.resolveStartConversation(BUYER, publishedId);
    expect(out.kind).toBe('redirect');
    if (out.kind !== 'redirect') return;
    expect(out.to).toMatch(MESSAGES_RE);
    expect(out.created).toBe(true);
  });

  it('a repeated request reuses the SAME conversation (created=false)', async () => {
    const first = await core.resolveStartConversation(BUYER, publishedId);
    const second = await core.resolveStartConversation(BUYER, publishedId);
    if (first.kind !== 'redirect' || second.kind !== 'redirect') {
      throw new Error('expected redirects');
    }
    expect(second.to).toBe(first.to);
    expect(second.created).toBe(false);
    const count = await prisma.conversation.count({
      where: { listingId: publishedId, buyerProfileId: BUYER },
    });
    expect(count).toBe(1);
  });

  it('concurrent duplicate submissions create exactly one conversation', async () => {
    const listing = await prisma.listing.create({
      data: {
        sellerId: sellerProfileId,
        categoryId,
        title: 'Race action listing',
        description: 'A test listing.',
        size: 'M',
        condition: 'good',
        gender: 'unisex',
        priceMinor: 15000,
        currency: 'MKD',
        location: 'Skopje',
        status: 'published',
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    const [a, b] = await Promise.all([
      core.resolveStartConversation(OTHER, listing.id),
      core.resolveStartConversation(OTHER, listing.id),
    ]);
    if (a.kind !== 'redirect' || b.kind !== 'redirect') {
      throw new Error('expected redirects');
    }
    expect(a.to).toBe(b.to); // same conversation
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1); // one insert won
    const count = await prisma.conversation.count({
      where: { listingId: listing.id, buyerProfileId: OTHER },
    });
    expect(count).toBe(1);
  });
});

describe('resolveStartConversation — authorization + non-disclosure', () => {
  it('the seller cannot start a conversation with their own listing', async () => {
    const out = await core.resolveStartConversation(SELLER, publishedId);
    expect(out).toEqual({ kind: 'error', error: 'ownListing' });
  });

  it('draft, paused, archived, unknown all return the SAME notFound', async () => {
    const unknown = '99999999-9999-9999-9999-999999999999';
    for (const id of [draftId, pausedId, archivedId, unknown]) {
      const out = await core.resolveStartConversation(BUYER, id);
      expect(out).toEqual({ kind: 'error', error: 'notFound' });
    }
  });

  it('a malformed listing id is notFound (uniform with non-public), not a crash', async () => {
    const out = await core.resolveStartConversation(BUYER, 'not-a-uuid');
    expect(out).toEqual({ kind: 'error', error: 'notFound' });
  });

  it('a removed (hard-deleted) listing behaves as notFound for NEW conversations', async () => {
    const listing = await prisma.listing.create({
      data: {
        sellerId: sellerProfileId,
        categoryId,
        title: 'Delete me',
        description: 'A test listing.',
        size: 'M',
        condition: 'good',
        gender: 'unisex',
        priceMinor: 15000,
        currency: 'MKD',
        location: 'Skopje',
        status: 'published',
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.listing.delete({ where: { id: listing.id } });
    const out = await core.resolveStartConversation(BUYER, listing.id);
    expect(out).toEqual({ kind: 'error', error: 'notFound' });
  });
});
