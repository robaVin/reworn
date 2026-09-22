import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { DraftListingInput } from '@/modules/catalog/schemas';

/**
 * Saved items (wishlist) integration tests against a REAL PostgreSQL (embedded).
 * Covers: migration 0020 applies; the saved service (idempotent save/unsave,
 * owner-scoped reads, visibility filtering, ordering, FK cascade); IDOR (a user
 * cannot read/remove another user's saves); and the owner-only RLS read policy.
 */

const SELLER = 'a1111111-1111-1111-1111-111111111111';
const USER_A = 'd1111111-1111-1111-1111-111111111111';
const USER_B = 'd2222222-2222-2222-2222-222222222222';

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;
let categoryId: string;

let prisma: typeof import('@/lib/db').prisma;
let listingSvc: typeof import('@/modules/catalog/listing-service');
let saved: typeof import('@/modules/saved/service');

function baseInput(title: string): DraftListingInput {
  return {
    title,
    description: 'Warm wool coat, excellent condition.',
    categoryId,
    size: 'M',
    condition: 'very_good',
    gender: 'unisex',
    priceMinor: 24000,
    currency: 'MKD',
    location: 'Skopje',
  };
}

/** Create a fresh PUBLISHED listing owned by SELLER; returns its id. */
async function publishedListing(title: string): Promise<string> {
  const draft = await listingSvc.createDraftListing(SELLER, baseInput(title));
  const pub = await listingSvc.transitionListing(SELLER, draft.id, 'publish');
  return pub.id;
}

async function runAs(
  identity: string | 'anon',
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  await sql.query('BEGIN');
  try {
    if (identity === 'anon') {
      await sql.query('SET LOCAL ROLE anon');
    } else {
      await sql.query('SET LOCAL ROLE authenticated');
      await sql.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: identity }),
      ]);
    }
    const res = await sql.query(text, params);
    await sql.query('ROLLBACK');
    return res;
  } catch (e) {
    await sql.query('ROLLBACK');
    throw e;
  }
}

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-saved-'));
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
  listingSvc = await import('@/modules/catalog/listing-service');
  saved = await import('@/modules/saved/service');

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  categoryId = (await prisma.category.findFirstOrThrow()).id;

  await prisma.profile.createMany({
    data: [SELLER, USER_A, USER_B].map((id) => ({ id })),
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER, roleId: sellerRole.id },
      { profileId: USER_A, roleId: buyerRole.id },
      { profileId: USER_B, roleId: buyerRole.id },
    ],
    skipDuplicates: true,
  });
  await prisma.sellerProfile.create({
    data: {
      profileId: SELLER,
      shopName: 'Seller Shop',
      status: 'active',
      handle: 'seller-shop',
    },
  });
}, 180_000);

afterAll(async () => {
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('saved service — save / unsave (idempotent, owner-scoped)', () => {
  it('saves a published listing; a repeat save does not duplicate', async () => {
    const id = await publishedListing('Save Coat 001');
    await saved.saveListing(USER_A, id);
    await saved.saveListing(USER_A, id); // idempotent
    const count = await prisma.savedItem.count({
      where: { userId: USER_A, listingId: id },
    });
    expect(count).toBe(1);
  });

  it('rejects saving a non-visible (draft) listing as not-found', async () => {
    const draft = await listingSvc.createDraftListing(
      SELLER,
      baseInput('Hidden Draft'),
    );
    await expect(saved.saveListing(USER_A, draft.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('unsave removes it; a second unsave is a safe no-op', async () => {
    const id = await publishedListing('Save Coat 002');
    await saved.saveListing(USER_A, id);
    await saved.unsaveListing(USER_A, id);
    await saved.unsaveListing(USER_A, id); // no-op
    expect(
      await prisma.savedItem.count({
        where: { userId: USER_A, listingId: id },
      }),
    ).toBe(0);
  });

  it('getSavedListingIds is scoped to the user (empty query hits no DB)', async () => {
    const id = await publishedListing('Save Coat 003');
    await saved.saveListing(USER_A, id);
    const forA = await saved.getSavedListingIds(USER_A, [id]);
    const forB = await saved.getSavedListingIds(USER_B, [id]);
    expect(forA.has(id)).toBe(true);
    expect(forB.has(id)).toBe(false);
    expect((await saved.getSavedListingIds(USER_A, [])).size).toBe(0);
  });

  it('multiple users may save the same listing; one user many listings', async () => {
    const shared = await publishedListing('Shared Coat');
    await saved.saveListing(USER_A, shared);
    await saved.saveListing(USER_B, shared);
    expect(await prisma.savedItem.count({ where: { listingId: shared } })).toBe(
      2,
    );

    const l1 = await publishedListing('Many 1');
    const l2 = await publishedListing('Many 2');
    await saved.saveListing(USER_B, l1);
    await saved.saveListing(USER_B, l2);
    const ids = await saved.getSavedListingIds(USER_B, [l1, l2, shared]);
    expect(ids.size).toBe(3);
  });
});

describe('saved service — IDOR (cross-user isolation)', () => {
  it("a user cannot remove or read another user's saved item", async () => {
    const id = await publishedListing('Owned by A');
    await saved.saveListing(USER_A, id);

    // USER_B "unsaving" A's listing only affects B's own (nonexistent) rows.
    await saved.unsaveListing(USER_B, id);
    expect(
      await prisma.savedItem.count({
        where: { userId: USER_A, listingId: id },
      }),
    ).toBe(1);

    // USER_B cannot see it via the scoped reads.
    expect((await saved.getSavedListingIds(USER_B, [id])).has(id)).toBe(false);
    const bList = await saved.listSavedForUser(USER_B);
    expect(bList.some((c) => c.id === id)).toBe(false);
  });
});

describe('saved service — /saved visibility + ordering', () => {
  it('lists published + sold; hides draft/paused/archived; newest first', async () => {
    const fresh = 'e0000000-0000-0000-0000-000000000000';
    await prisma.profile.create({ data: { id: fresh } });

    const pub = await publishedListing('Vis Published');
    const soldL = await publishedListing('Vis Sold');
    const pausedL = await publishedListing('Vis Paused');

    await saved.saveListing(fresh, pub);
    await saved.saveListing(fresh, soldL);
    await saved.saveListing(fresh, pausedL);

    // Transition AFTER saving (relations must survive lifecycle changes).
    await listingSvc.transitionListing(SELLER, soldL, 'markSold');
    await listingSvc.transitionListing(SELLER, pausedL, 'pause');

    const list = await saved.listSavedForUser(fresh);
    const ids = list.map((c) => c.id);
    expect(ids).toContain(pub);
    expect(ids).toContain(soldL); // sold IS shown...
    expect(list.find((c) => c.id === soldL)?.status).toBe('sold'); // ...as sold
    expect(ids).not.toContain(pausedL); // paused hidden

    // Newest-saved first: pausedL was saved last but is hidden; of the visible
    // ones, soldL was saved after pub -> soldL precedes pub.
    expect(ids.indexOf(soldL)).toBeLessThan(ids.indexOf(pub));
  });

  it('published -> paused -> published: the saved item reappears automatically', async () => {
    const fresh = 'e1111111-1111-1111-1111-111111111111';
    await prisma.profile.create({ data: { id: fresh } });
    const id = await publishedListing('Reappear Coat');
    await saved.saveListing(fresh, id);

    expect((await saved.listSavedForUser(fresh)).some((c) => c.id === id)).toBe(
      true,
    );
    await listingSvc.transitionListing(SELLER, id, 'pause');
    expect((await saved.listSavedForUser(fresh)).some((c) => c.id === id)).toBe(
      false,
    );
    await listingSvc.transitionListing(SELLER, id, 'republish');
    expect((await saved.listSavedForUser(fresh)).some((c) => c.id === id)).toBe(
      true,
    );

    // The relation was never destroyed by the lifecycle changes.
    expect(
      await prisma.savedItem.count({ where: { userId: fresh, listingId: id } }),
    ).toBe(1);
  });
});

describe('saved service — FK cascade', () => {
  it('deleting a listing removes its saved rows (no orphans)', async () => {
    const id = await publishedListing('Cascade Coat');
    await saved.saveListing(USER_A, id);
    await prisma.listing.delete({ where: { id } });
    expect(await prisma.savedItem.count({ where: { listingId: id } })).toBe(0);
  });
});

describe('saved_items RLS (owner-only read)', () => {
  it('a user reads only their own saved rows; others and anon read none', async () => {
    const id = await publishedListing('RLS Coat');
    await saved.saveListing(USER_A, id);

    // Owner sees exactly their own row (RLS filters to current_app_user_id()).
    const own = await runAs(
      USER_A,
      'SELECT count(*)::int n FROM saved_items WHERE listing_id = $1',
      [id],
    );
    expect(own.rows[0].n).toBe(1);

    // Another authenticated user may read the table but RLS shows them none.
    const other = await runAs(
      USER_B,
      'SELECT count(*)::int n FROM saved_items WHERE listing_id = $1',
      [id],
    );
    expect(other.rows[0].n).toBe(0);

    // anon has NO grant at all on saved_items (stricter than listings) — the
    // read is refused at the table level, not merely filtered to zero rows.
    await expect(
      runAs('anon', 'SELECT count(*) FROM saved_items'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a user cannot write saved_items directly (no write grant)', async () => {
    const id = await publishedListing('RLS Write Coat');
    await expect(
      runAs(
        USER_B,
        'INSERT INTO saved_items (id, user_id, listing_id, created_at) VALUES (gen_random_uuid(), $1, $2, now())',
        [USER_B, id],
      ),
    ).rejects.toThrow();
  });
});
