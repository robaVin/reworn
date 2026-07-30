import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from '@/modules/catalog/storage';
import { buildListingSlug } from '@/modules/catalog/listing-slug';

/**
 * UX-1.2A schema slice — against REAL PostgreSQL (embedded), exercising
 * migration 0018: a stable public `slug` generated ONCE at first publish, and
 * the informational `deliveryMethod` / `deliveryNote` columns. Verifies the
 * write service, the public by-slug read, and slug stability + uniqueness.
 */

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/catalog/listing-service');
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

let userId: string; // == seller profile id
let categoryId: string;

/** A complete draft input (publishable), overridable per test. */
function draftInput(over: Record<string, unknown> = {}) {
  return {
    title: 'Wool Overcoat',
    description: 'Pre-loved wool overcoat in great condition.',
    categoryId,
    size: 'M',
    condition: 'very_good' as const,
    gender: 'men' as const,
    priceMinor: 24000,
    currency: 'MKD',
    location: 'Skopje',
    ...over,
  };
}

async function newSellerUser(handle: string): Promise<string> {
  const prof = await prisma.profile.create({ data: { id: randomUUID() } });
  await prisma.sellerProfile.create({
    data: {
      profileId: prof.id,
      shopName: `Shop ${handle}`,
      handle,
      status: 'active',
    },
  });
  return prof.id;
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-slug-'));
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
  svc = await import('@/modules/catalog/listing-service');
  pub = await import('@/modules/catalog/public-catalog');
  storageMod = await import('@/modules/catalog/storage');
  storageMod.setStorageAdapter(new FakeStorage());

  categoryId = (
    await prisma.category.findFirstOrThrow({ where: { slug: 'clothing' } })
  ).id;
  userId = await newSellerUser('slug-shop');
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('delivery fields', () => {
  it('persist through create and update; default to unspecified', async () => {
    const created = await svc.createDraftListing(userId, draftInput());
    expect(created.deliveryMethod).toBe('unspecified');
    expect(created.deliveryNote).toBeNull();

    await svc.updateListing(userId, created.id, {
      deliveryMethod: 'both',
      deliveryNote: 'Ships from Skopje; local pickup welcome',
    });
    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.deliveryMethod).toBe('both');
    expect(row.deliveryNote).toBe('Ships from Skopje; local pickup welcome');
  });
});

describe('slug generation at first publish', () => {
  it('a draft has no slug; publishing assigns a stable, id-derived slug', async () => {
    const draft = await svc.createDraftListing(userId, draftInput());
    expect(draft.slug).toBeNull();

    const published = await svc.transitionListing(userId, draft.id, 'publish');
    expect(published.slug).toBe(buildListingSlug(draft.id, 'Wool Overcoat'));
    expect(published.slug).toMatch(/^wool-overcoat-[0-9a-f]{8}$/);
    expect(published.publishedAt).not.toBeNull();
  });

  it('the slug is generated ONCE and never changes across edit + republish', async () => {
    const draft = await svc.createDraftListing(
      userId,
      draftInput({ title: 'Original Title' }),
    );
    const published = await svc.transitionListing(userId, draft.id, 'publish');
    const original = published.slug;
    expect(original).toMatch(/^original-title-/);

    // pause -> rename -> republish. The public URL must stay stable.
    await svc.transitionListing(userId, draft.id, 'pause');
    await svc.updateListing(userId, draft.id, { title: 'A Totally New Name' });
    const republished = await svc.transitionListing(
      userId,
      draft.id,
      'republish',
    );
    expect(republished.slug).toBe(original); // unchanged
    expect(republished.title).toBe('A Totally New Name');
  });

  it('two listings with the same title get distinct slugs', async () => {
    const a = await svc.createDraftListing(
      userId,
      draftInput({ title: 'Same Title' }),
    );
    const b = await svc.createDraftListing(
      userId,
      draftInput({ title: 'Same Title' }),
    );
    const pa = await svc.transitionListing(userId, a.id, 'publish');
    const pb = await svc.transitionListing(userId, b.id, 'publish');
    expect(pa.slug).not.toBe(pb.slug);
    expect(pa.slug).toMatch(/^same-title-/);
    expect(pb.slug).toMatch(/^same-title-/);
  });
});

describe('getPublicListingBySlug', () => {
  it('returns the published listing (with delivery fields) by slug', async () => {
    const draft = await svc.createDraftListing(
      userId,
      draftInput({ title: 'Findable Coat' }),
    );
    await svc.updateListing(userId, draft.id, {
      deliveryMethod: 'shipping',
      deliveryNote: 'Tracked post only',
    });
    const published = await svc.transitionListing(userId, draft.id, 'publish');

    const detail = await pub.getPublicListingBySlug(published.slug!);
    expect(detail).not.toBeNull();
    expect(detail!.id).toBe(draft.id);
    expect(detail!.slug).toBe(published.slug);
    expect(detail!.deliveryMethod).toBe('shipping');
    expect(detail!.deliveryNote).toBe('Tracked post only');
  });

  it('returns null for an unknown slug and never leaks a draft', async () => {
    expect(
      await pub.getPublicListingBySlug('does-not-exist-00000000'),
    ).toBeNull();

    const draft = await svc.createDraftListing(
      userId,
      draftInput({ title: 'Hidden Draft' }),
    );
    // A draft has a NULL slug, so it is unreachable by the by-slug read.
    const row = await prisma.listing.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(row.slug).toBeNull();
  });
});
