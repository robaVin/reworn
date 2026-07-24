import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import {
  draftListingSchema,
  type DraftListingInput,
} from '@/modules/catalog/schemas';

/** Parse partial input through the draft schema (as the server action does). */
const parseDraft = (p: Record<string, unknown>): DraftListingInput =>
  draftListingSchema.parse(p);

/**
 * Listing domain integration tests against a REAL PostgreSQL (embedded).
 * Covers: migrations 0005/0006 apply; the listing service (ownership,
 * entitlement, lifecycle transitions, visibility); and the RLS read policies
 * (public sees published; owner sees own drafts; others/anon do not; admin
 * sees all; users cannot write listings directly).
 */

const SELLER = 'a1111111-1111-1111-1111-111111111111';
const OTHER_SELLER = 'a2222222-2222-2222-2222-222222222222';
const FROZEN_SELLER = 'a3333333-3333-3333-3333-333333333333';
const BUYER = 'b1111111-1111-1111-1111-111111111111';
const ADMIN = 'c1111111-1111-1111-1111-111111111111';

const PORT = 54366;
const url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;

let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;
let categoryId: string;
let publishedId: string;
let draftId: string;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/catalog/listing-service');
let AuthorizationError: typeof import('@/modules/auth/errors').AuthorizationError;
let ListingConflictError: typeof import('@/modules/catalog/errors').ListingConflictError;
let ListingIncompleteError: typeof import('@/modules/catalog/errors').ListingIncompleteError;
let InvalidListingTransitionError: typeof import('@/modules/catalog/listing-status').InvalidListingTransitionError;

function baseInput(): DraftListingInput {
  return {
    title: 'Wool Overcoat',
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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-listings-'));
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
  ({ AuthorizationError } = await import('@/modules/auth/errors'));
  ({ ListingConflictError, ListingIncompleteError } =
    await import('@/modules/catalog/errors'));
  ({ InvalidListingTransitionError } =
    await import('@/modules/catalog/listing-status'));

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  // Fixtures
  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'admin' },
  });
  const category = await prisma.category.findFirstOrThrow();
  categoryId = category.id;

  await prisma.profile.createMany({
    data: [SELLER, OTHER_SELLER, FROZEN_SELLER, BUYER, ADMIN].map((id) => ({
      id,
    })),
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER, roleId: buyerRole.id },
      { profileId: SELLER, roleId: sellerRole.id },
      { profileId: OTHER_SELLER, roleId: sellerRole.id },
      { profileId: FROZEN_SELLER, roleId: sellerRole.id },
      { profileId: BUYER, roleId: buyerRole.id },
      { profileId: ADMIN, roleId: buyerRole.id },
      { profileId: ADMIN, roleId: adminRole.id },
    ],
    skipDuplicates: true,
  });
  await prisma.sellerProfile.createMany({
    data: [
      { profileId: SELLER, shopName: 'Seller Shop', status: 'active' },
      { profileId: OTHER_SELLER, shopName: 'Other Shop', status: 'active' },
      { profileId: FROZEN_SELLER, shopName: 'Frozen Shop', status: 'frozen' },
    ],
    skipDuplicates: true,
  });
}, 180_000);

afterAll(async () => {
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('listing service — create & entitlement', () => {
  it('creates a draft for an active seller', async () => {
    const listing = await svc.createDraftListing(SELLER, baseInput());
    expect(listing.status).toBe('draft');
    expect(listing.publishedAt).toBeNull();
    draftId = listing.id;
  });

  it('refuses a user with no seller profile (403)', async () => {
    await expect(
      svc.createDraftListing(BUYER, baseInput()),
    ).rejects.toMatchObject({ status: 403, reason: 'seller_profile_required' });
  });

  it('refuses a frozen seller via the entitlement gate (403)', async () => {
    await expect(
      svc.createDraftListing(FROZEN_SELLER, baseInput()),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('listing service — lifecycle', () => {
  it('publishes a draft and stamps publishedAt', async () => {
    const published = await svc.transitionListing(SELLER, draftId, 'publish');
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();
    publishedId = published.id;
  });

  it('rejects an illegal transition (publish an already-published listing)', async () => {
    await expect(
      svc.transitionListing(SELLER, publishedId, 'publish'),
    ).rejects.toBeInstanceOf(InvalidListingTransitionError);
  });

  it('a non-owner cannot transition (404 hides existence)', async () => {
    await expect(
      svc.transitionListing(OTHER_SELLER, publishedId, 'pause'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('cannot edit a published listing (409 conflict)', async () => {
    await expect(
      svc.updateListing(SELLER, publishedId, { title: 'x' }),
    ).rejects.toBeInstanceOf(ListingConflictError);
  });

  it('can edit after pausing, then republish', async () => {
    await svc.transitionListing(SELLER, publishedId, 'pause');
    const edited = await svc.updateListing(SELLER, publishedId, {
      title: 'Wool Overcoat (updated)',
    });
    expect(edited.title).toBe('Wool Overcoat (updated)');
    const republished = await svc.transitionListing(
      SELLER,
      publishedId,
      'republish',
    );
    expect(republished.status).toBe('published');
  });
});

describe('listing service — visibility', () => {
  it('published listing is visible to anyone (incl. anonymous)', async () => {
    expect(await svc.getListingForViewer(null, publishedId)).not.toBeNull();
  });

  it('a fresh draft is hidden from non-owners and anonymous', async () => {
    const draft = await svc.createDraftListing(SELLER, baseInput());
    expect(await svc.getListingForViewer(null, draft.id)).toBeNull();
    expect(
      await svc.getListingForViewer(
        { userId: OTHER_SELLER, roles: ['seller'] },
        draft.id,
      ),
    ).toBeNull();
    // Owner and admin can see it.
    expect(
      await svc.getListingForViewer(
        { userId: SELLER, roles: ['seller'] },
        draft.id,
      ),
    ).not.toBeNull();
    expect(
      await svc.getListingForViewer(
        { userId: ADMIN, roles: ['admin'] },
        draft.id,
      ),
    ).not.toBeNull();
  });

  it('listPublished returns only published listings and paginates', async () => {
    const page = await svc.listPublishedListings({ take: 1 });
    expect(page.items.every((l) => l.status === 'published')).toBe(true);
    expect(page.items).toHaveLength(1);
    // There is at least one published listing; nextCursor may or may not be set
    // depending on count, but the shape must hold.
    expect(page).toHaveProperty('nextCursor');
  });

  it('listSellerListings returns the owner listings in any status', async () => {
    const mine = await svc.listSellerListings(SELLER);
    expect(mine.length).toBeGreaterThanOrEqual(2);
  });
});

describe('listing service — drafts, completeness, IDOR, duplicates', () => {
  it('allows an incomplete (title-only) draft', async () => {
    const draft = await svc.createDraftListing(
      SELLER,
      parseDraft({ title: 'Just a title' }),
    );
    expect(draft.status).toBe('draft');
    expect(draft.priceMinor).toBeNull();
    expect(draft.categoryId).toBeNull();
  });

  it('refuses to publish an incomplete draft (missing mandatory fields)', async () => {
    const draft = await svc.createDraftListing(
      SELLER,
      parseDraft({ title: 'Incomplete' }),
    );
    await expect(
      svc.transitionListing(SELLER, draft.id, 'publish'),
    ).rejects.toBeInstanceOf(ListingIncompleteError);
    // It stays a draft.
    const still = await svc.getListingForViewer(
      { userId: SELLER, roles: ['seller'] },
      draft.id,
    );
    expect(still?.status).toBe('draft');
  });

  it('a seller cannot update another seller’s draft (404 hides existence)', async () => {
    const draft = await svc.createDraftListing(
      SELLER,
      parseDraft({ title: 'Mine' }),
    );
    await expect(
      svc.updateListing(OTHER_SELLER, draft.id, { title: 'Hijacked' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('rejects a non-existent category (referential integrity)', async () => {
    await expect(
      svc.createDraftListing(
        SELLER,
        parseDraft({
          title: 'Bad category',
          categoryId: '99999999-9999-9999-9999-999999999999',
        }),
      ),
    ).rejects.toThrow();
  });

  it('reusing the draft id does not create duplicates', async () => {
    const before = await prisma.listing.count({
      where: { sellerId: undefined },
    });
    const draft = await svc.createDraftListing(
      SELLER,
      parseDraft({ title: 'One draft' }),
    );
    await svc.updateListing(SELLER, draft.id, { title: 'One draft (edited)' });
    await svc.updateListing(SELLER, draft.id, { size: 'L' });
    const rows = await prisma.listing.count({
      where: { title: 'One draft (edited)' },
    });
    expect(rows).toBe(1);
    expect(before).toBeGreaterThanOrEqual(0);
  });

  it('hostile ids do not leak other listings via read', async () => {
    // OTHER_SELLER cannot read SELLER's draft through the service.
    const draft = await svc.createDraftListing(
      SELLER,
      parseDraft({ title: 'Secret draft' }),
    );
    const seen = await svc.getListingForViewer(
      { userId: OTHER_SELLER, roles: ['seller'] },
      draft.id,
    );
    expect(seen).toBeNull();
  });
});

describe('listing persistence verification (credential-free)', () => {
  it('create → publish yields exactly the expected persisted state', async () => {
    const uniqueTitle = 'Persistence Check 11223344';
    const created = await svc.createDraftListing(SELLER, {
      ...baseInput(),
      title: uniqueTitle,
    });
    // draft created
    expect(created.status).toBe('draft');
    expect(created.publishedAt).toBeNull();

    // belongs to the correct seller
    const sellerProfile = await prisma.sellerProfile.findUniqueOrThrow({
      where: { profileId: SELLER },
    });
    expect(created.sellerId).toBe(sellerProfile.id);

    // publishing changes status and stamps publishedAt (same row, no new one)
    const published = await svc.transitionListing(
      SELLER,
      created.id,
      'publish',
    );
    expect(published.id).toBe(created.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();

    // no duplicate listing for this title
    expect(await prisma.listing.count({ where: { title: uniqueTitle } })).toBe(
      1,
    );

    // no fake subscription or payment rows were created by this flow
    expect(await prisma.subscription.count()).toBe(0);
    expect(await prisma.paymentAttempt.count()).toBe(0);
    expect(await prisma.paymentEvent.count()).toBe(0);
  });
});

describe('seller access (getSellerAccess, dev bridge — enforcement off)', () => {
  it('an active provisioned seller can publish (no fake subscription created)', async () => {
    const access = await svc.getSellerAccess(SELLER);
    expect(access.seller?.status).toBe('active');
    expect(access.subscriptionEnforced).toBe(false);
    expect(access.hasActiveSubscription).toBe(false); // no real subscription
    expect(access.canPublish).toBe(true);
    // No subscription rows were fabricated by checking access.
    const subs = await prisma.subscription.count();
    expect(subs).toBe(0);
  });

  it('a buyer has no seller access', async () => {
    const access = await svc.getSellerAccess(BUYER);
    expect(access.seller).toBeNull();
    expect(access.canPublish).toBe(false);
  });

  it('a frozen seller cannot publish', async () => {
    const access = await svc.getSellerAccess(FROZEN_SELLER);
    expect(access.seller?.status).toBe('frozen');
    expect(access.canPublish).toBe(false);
  });
});

describe('listing RLS (read path)', () => {
  it('anon and other users see published listings', async () => {
    const anon = await runAs('anon', 'SELECT count(*)::int n FROM listings');
    expect(anon.rows[0].n).toBeGreaterThanOrEqual(1);
    const other = await runAs(
      OTHER_SELLER,
      "SELECT count(*)::int n FROM listings WHERE status='published'",
    );
    expect(other.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('a draft is visible to its owner but not to other users or anon', async () => {
    // Draft ids belonging to SELLER:
    const owner = await runAs(
      SELLER,
      "SELECT count(*)::int n FROM listings WHERE status='draft'",
    );
    expect(owner.rows[0].n).toBeGreaterThanOrEqual(1);

    const other = await runAs(
      OTHER_SELLER,
      "SELECT count(*)::int n FROM listings WHERE status='draft'",
    );
    expect(other.rows[0].n).toBe(0);

    const anon = await runAs(
      'anon',
      "SELECT count(*)::int n FROM listings WHERE status='draft'",
    );
    expect(anon.rows[0].n).toBe(0);
  });

  it('admin sees drafts too', async () => {
    const admin = await runAs(
      ADMIN,
      "SELECT count(*)::int n FROM listings WHERE status='draft'",
    );
    expect(admin.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it('a user cannot INSERT or UPDATE listings directly (no write grant)', async () => {
    await expect(
      runAs(
        SELLER,
        `INSERT INTO listings (id, seller_id, category_id, title, description, size, condition, price_minor, location, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 't', 'd', 'M', 'good', 100, 'Skopje', 'published', now())`,
        [SELLER, categoryId],
      ),
    ).rejects.toThrow();

    await expect(
      runAs(SELLER, "UPDATE listings SET status='published'"),
    ).rejects.toThrow();
  });
});
