import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

/**
 * Messaging domain integration tests against a REAL PostgreSQL (embedded).
 * Covers migration 0013 (tables/constraints/triggers/RLS), the messaging
 * service (idempotent creation, participant authorization, non-disclosure of
 * non-public listings, validation, deterministic ordering), the DTO privacy
 * contract, concurrency safety, and the RLS read policies.
 */

const SELLER = 'd1111111-1111-1111-1111-111111111111';
const BUYER = 'd2222222-2222-2222-2222-222222222222';
const BUYER2 = 'd3333333-3333-3333-3333-333333333333';
const OTHER = 'd4444444-4444-4444-4444-444444444444';

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/messaging/service');
let publicCatalog: typeof import('@/modules/catalog/public-catalog');
let MessageRejectedError: typeof import('@/modules/messaging/errors').MessageRejectedError;

let sellerProfileId: string; // SellerProfile.id (FK on listings)
let categoryId: string;
let publishedId: string;
let draftId: string;
let pausedId: string;
let archivedId: string;

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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-messaging-'));
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
  publicCatalog = await import('@/modules/catalog/public-catalog');
  ({ MessageRejectedError } = await import('@/modules/messaging/errors'));

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  const category = await prisma.category.findFirstOrThrow();
  categoryId = category.id;

  await prisma.profile.createMany({
    data: [
      { id: SELLER },
      { id: BUYER }, // no displayName -> counterparty fallback label
      { id: BUYER2, displayName: 'Buyer Two' },
      { id: OTHER },
    ],
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER, roleId: sellerRole.id },
      { profileId: BUYER, roleId: buyerRole.id },
      { profileId: BUYER2, roleId: buyerRole.id },
      { profileId: OTHER, roleId: buyerRole.id },
    ],
    skipDuplicates: true,
  });
  const seller = await prisma.sellerProfile.create({
    data: {
      profileId: SELLER,
      shopName: 'Msg Seller Shop',
      status: 'active',
      handle: 'msg-seller',
    },
  });
  sellerProfileId = seller.id;

  const mk = async (status: 'published' | 'draft' | 'paused' | 'archived') => {
    const row = await prisma.listing.create({
      data: {
        sellerId: sellerProfileId,
        categoryId: category.id,
        title: `Listing ${status}`,
        description: 'A test listing.',
        size: 'M',
        condition: 'good',
        gender: 'unisex',
        priceMinor: 12000,
        currency: 'MKD',
        location: 'Skopje',
        status,
        ...(status === 'published' ||
        status === 'paused' ||
        status === 'archived'
          ? { publishedAt: new Date() }
          : {}),
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
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('conversation creation + idempotency', () => {
  it('a buyer creates a conversation for a published listing', async () => {
    const r = await svc.getOrCreateConversationForListing(BUYER, publishedId);
    expect(r.created).toBe(true);
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('repeat requests return the SAME conversation (idempotent)', async () => {
    const first = await svc.getOrCreateConversationForListing(
      BUYER,
      publishedId,
    );
    const second = await svc.getOrCreateConversationForListing(
      BUYER,
      publishedId,
    );
    expect(second.id).toBe(first.id);
    expect(second.created).toBe(false);
    const count = await prisma.conversation.count({
      where: { listingId: publishedId, buyerProfileId: BUYER },
    });
    expect(count).toBe(1);
  });

  it('the seller cannot open a buyer-style conversation with their own listing', async () => {
    await expect(
      svc.getOrCreateConversationForListing(SELLER, publishedId),
    ).rejects.toMatchObject({
      status: 403,
      reason: 'cannot_message_own_listing',
    });
  });

  it('a different buyer gets a DIFFERENT conversation for the same listing', async () => {
    const a = await svc.getOrCreateConversationForListing(BUYER, publishedId);
    const b = await svc.getOrCreateConversationForListing(BUYER2, publishedId);
    expect(b.id).not.toBe(a.id);
  });
});

describe('non-public listings never reveal their existence', () => {
  it('draft, paused, archived, and unknown all return the SAME 404', async () => {
    const unknown = '99999999-9999-9999-9999-999999999999';
    for (const id of [draftId, pausedId, archivedId, unknown]) {
      await expect(
        svc.getOrCreateConversationForListing(BUYER, id),
      ).rejects.toMatchObject({ status: 404, reason: 'not_found' });
    }
  });

  it('a malformed listing id is a uniform not-found, not a crash', async () => {
    await expect(
      svc.getOrCreateConversationForListing(BUYER, 'not-a-uuid'),
    ).rejects.toMatchObject({ status: 404, reason: 'not_found' });
  });
});

describe('participant authorization (service)', () => {
  let convId: string;
  beforeAll(async () => {
    convId = (await svc.getOrCreateConversationForListing(BUYER, publishedId))
      .id;
    await svc.sendConversationMessage(
      BUYER,
      convId,
      'Hello, is this available?',
    );
    await svc.sendConversationMessage(SELLER, convId, 'Yes it is!');
  });

  it('both participants can read the conversation', async () => {
    expect(
      await svc.getConversationForCurrentUser(BUYER, convId),
    ).not.toBeNull();
    expect(
      await svc.getConversationForCurrentUser(SELLER, convId),
    ).not.toBeNull();
  });

  it('a third user cannot read the conversation (null, not error)', async () => {
    expect(await svc.getConversationForCurrentUser(OTHER, convId)).toBeNull();
  });

  it('a third user cannot list its messages (404)', async () => {
    await expect(
      svc.listConversationMessages(OTHER, convId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a third user cannot send a message (404)', async () => {
    await expect(
      svc.sendConversationMessage(OTHER, convId, 'let me in'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a non-participant / malformed conversation id behaves as not-found', async () => {
    expect(
      await svc.getConversationForCurrentUser(BUYER, 'not-a-uuid'),
    ).toBeNull();
    expect(
      await svc.getConversationForCurrentUser(
        BUYER,
        '00000000-0000-0000-0000-000000000000',
      ),
    ).toBeNull();
  });
});

describe('messages: sending, validation, ordering, activity', () => {
  let convId: string;
  beforeAll(async () => {
    convId = (await svc.getOrCreateConversationForListing(BUYER2, publishedId))
      .id;
  });

  it('sends a message and marks the author with sentByViewer (no sender id)', async () => {
    const m = await svc.sendConversationMessage(BUYER2, convId, '  Hi there  ');
    expect(m.body).toBe('Hi there'); // trimmed
    expect(m.sentByViewer).toBe(true);
    expect(m).not.toHaveProperty('senderProfileId');
  });

  it('normalizes CRLF to LF and preserves internal newlines', async () => {
    const m = await svc.sendConversationMessage(
      BUYER2,
      convId,
      'first\r\nsecond\r\n\r\nthird',
    );
    expect(m.body).toBe('first\nsecond\n\nthird');
  });

  it('rejects empty, whitespace-only, and over-limit bodies', async () => {
    await expect(
      svc.sendConversationMessage(BUYER2, convId, '   '),
    ).rejects.toBeInstanceOf(MessageRejectedError);
    await expect(
      svc.sendConversationMessage(BUYER2, convId, ''),
    ).rejects.toBeInstanceOf(MessageRejectedError);
    await expect(
      svc.sendConversationMessage(BUYER2, convId, 'x'.repeat(4001)),
    ).rejects.toMatchObject({ status: 422, reason: 'too_long' });
  });

  it('inserting a message bumps conversation activity atomically (trigger)', async () => {
    const before = await prisma.conversation.findUniqueOrThrow({
      where: { id: convId },
      select: { lastMessageAt: true },
    });
    const m = await svc.sendConversationMessage(BUYER2, convId, 'ping');
    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: convId },
      select: { lastMessageAt: true },
    });
    expect(after.lastMessageAt.getTime()).toBeGreaterThanOrEqual(
      before.lastMessageAt.getTime(),
    );
    // The bump matches the new message's timestamp.
    const msg = await prisma.message.findUniqueOrThrow({ where: { id: m.id } });
    expect(after.lastMessageAt.getTime()).toBe(msg.createdAt.getTime());
  });
});

describe('deterministic ordering with equal timestamps', () => {
  it('orders equal-createdAt messages by id ASC', async () => {
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER, publishedId)
    ).id;
    const ts = new Date('2026-07-01T00:00:00.000Z');
    // Two messages with the SAME createdAt, inserted out of id order.
    const idHigh = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const idLow = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await prisma.message.create({
      data: {
        id: idHigh,
        conversationId: convId,
        senderProfileId: BUYER,
        body: 'high id',
        createdAt: ts,
      },
    });
    await prisma.message.create({
      data: {
        id: idLow,
        conversationId: convId,
        senderProfileId: BUYER,
        body: 'low id',
        createdAt: ts,
      },
    });
    const page = await svc.listConversationMessages(BUYER, convId);
    const idxLow = page.items.findIndex((m) => m.id === idLow);
    const idxHigh = page.items.findIndex((m) => m.id === idHigh);
    expect(idxLow).toBeGreaterThanOrEqual(0);
    expect(idxLow).toBeLessThan(idxHigh); // low id comes first at equal ts
  });
});

describe('DB-level backstops (independent of the service)', () => {
  let convId: string;
  beforeAll(async () => {
    convId = (await svc.getOrCreateConversationForListing(BUYER, publishedId))
      .id;
  });

  it('the trigger rejects a message whose sender is not a participant', async () => {
    await expect(
      prisma.message.create({
        data: { conversationId: convId, senderProfileId: OTHER, body: 'hi' },
      }),
    ).rejects.toThrow();
  });

  it('CHECK rejects an empty / blank / control-char body', async () => {
    const ctrl = String.fromCharCode(0x07);
    for (const body of ['', '   ', `bad${ctrl}char`]) {
      await expect(
        prisma.message.create({
          data: { conversationId: convId, senderProfileId: BUYER, body },
        }),
      ).rejects.toThrow();
    }
  });

  it('CHECK rejects a conversation whose buyer equals its seller', async () => {
    await expect(
      prisma.conversation.create({
        data: {
          listingId: publishedId,
          buyerProfileId: SELLER,
          sellerProfileId: SELLER,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('summaries, counterparty, and DTO privacy', () => {
  it('buyer sees the SELLER as counterparty (shop name + handle) with a preview', async () => {
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER, publishedId)
    ).id;
    await svc.sendConversationMessage(BUYER, convId, 'latest preview line');
    const page = await svc.listConversationSummariesForCurrentUser(BUYER);
    const found = page.items.find((c) => c.id === convId);
    expect(found).toBeTruthy();
    expect(found!.counterparty.kind).toBe('seller');
    expect(found!.counterparty.displayName).toBe('Msg Seller Shop');
    expect(found!.counterparty.handle).toBe('msg-seller');
    expect(found!.lastMessagePreview).toBe('latest preview line');
  });

  it('seller sees the BUYER as counterparty with a fallback label (no email/id)', async () => {
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER, publishedId)
    ).id;
    await svc.sendConversationMessage(BUYER, convId, 'hello seller');
    const page = await svc.listConversationSummariesForCurrentUser(SELLER);
    const found = page.items.find((c) => c.id === convId);
    expect(found).toBeTruthy();
    expect(found!.counterparty.kind).toBe('buyer');
    expect(found!.counterparty.displayName).toBe('ReWorn member'); // BUYER has no displayName
    expect(found!.counterparty.handle).toBeUndefined();
  });

  it('a self-chosen buyer display name is used when present', async () => {
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER2, publishedId)
    ).id;
    await svc.sendConversationMessage(BUYER2, convId, 'hi from buyer two');
    const page = await svc.listConversationSummariesForCurrentUser(SELLER);
    const found = page.items.find((c) => c.id === convId);
    expect(found!.counterparty.displayName).toBe('Buyer Two');
  });

  it('no public DTO leaks profile ids, emails, or internal identity', async () => {
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER, publishedId)
    ).id;
    await svc.sendConversationMessage(BUYER, convId, 'privacy check');
    const message = (await svc.listConversationMessages(BUYER, convId))
      .items[0];
    const conversation = await svc.getConversationForCurrentUser(BUYER, convId);
    const summaries = await svc.listConversationSummariesForCurrentUser(BUYER);
    const blob = JSON.stringify({ message, conversation, summaries });

    for (const id of [BUYER, BUYER2, SELLER, OTHER, sellerProfileId]) {
      expect(blob).not.toContain(id);
    }
    for (const key of [
      'profileId',
      'buyerProfileId',
      'sellerProfileId',
      'senderProfileId',
      'email',
      'subscription',
      'payment',
      'ownerId',
    ]) {
      expect(blob).not.toContain(key);
    }
  });
});

describe('access persists across listing-status changes', () => {
  it('a conversation stays reachable to participants after the listing is paused, while the public listing is hidden', async () => {
    // A fresh published listing + conversation.
    const listing = await prisma.listing.create({
      data: {
        sellerId: sellerProfileId,
        categoryId,
        title: 'Soon paused',
        description: 'A test listing.',
        size: 'M',
        condition: 'good',
        gender: 'unisex',
        location: 'Skopje',
        status: 'published',
        publishedAt: new Date(),
        priceMinor: 5000,
        currency: 'MKD',
      },
      select: { id: true },
    });
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER, listing.id)
    ).id;
    await svc.sendConversationMessage(BUYER, convId, 'still here');

    // Listing goes non-public.
    await prisma.listing.update({
      where: { id: listing.id },
      data: { status: 'paused' },
    });

    // Participants still reach the conversation and its (now-private) listing.
    const view = await svc.getConversationForCurrentUser(BUYER, convId);
    expect(view).not.toBeNull();
    expect(view!.listing.id).toBe(listing.id);
    expect(view!.listing.status).toBe('paused');

    // But the public listing service hides it.
    expect(await publicCatalog.getPublicListing(listing.id)).toBeNull();

    // And a NEW conversation can no longer be started from it.
    await expect(
      svc.getOrCreateConversationForListing(BUYER2, listing.id),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('concurrency: simultaneous create resolves to one conversation', () => {
  it('two simultaneous create requests return one conversation', async () => {
    const listing = await prisma.listing.create({
      data: {
        sellerId: sellerProfileId,
        categoryId,
        title: 'Race listing',
        description: 'A test listing.',
        size: 'M',
        condition: 'good',
        gender: 'unisex',
        location: 'Skopje',
        status: 'published',
        publishedAt: new Date(),
        priceMinor: 7000,
        currency: 'MKD',
      },
      select: { id: true },
    });
    const [a, b] = await Promise.all([
      svc.getOrCreateConversationForListing(OTHER, listing.id),
      svc.getOrCreateConversationForListing(OTHER, listing.id),
    ]);
    expect(a.id).toBe(b.id);
    // Exactly one insert won; the other returned the existing row.
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
    const count = await prisma.conversation.count({
      where: { listingId: listing.id, buyerProfileId: OTHER },
    });
    expect(count).toBe(1);
  });
});

describe('RLS read policies (participants only; no write grants)', () => {
  let convId: string;
  beforeAll(async () => {
    convId = (await svc.getOrCreateConversationForListing(BUYER, publishedId))
      .id;
    await svc.sendConversationMessage(BUYER, convId, 'rls hello');
  });

  it('a participant may SELECT the conversation; a third user and anon may not', async () => {
    const buyer = await runAs(
      BUYER,
      'SELECT count(*)::int n FROM conversations WHERE id = $1',
      [convId],
    );
    expect(buyer.rows[0].n).toBe(1);

    const seller = await runAs(
      SELLER,
      'SELECT count(*)::int n FROM conversations WHERE id = $1',
      [convId],
    );
    expect(seller.rows[0].n).toBe(1);

    const other = await runAs(
      OTHER,
      'SELECT count(*)::int n FROM conversations WHERE id = $1',
      [convId],
    );
    expect(other.rows[0].n).toBe(0); // no existence signal

    const anon = await runAs(
      'anon',
      'SELECT count(*)::int n FROM conversations',
    ).catch(() => ({ rows: [{ n: 0 }] }) as unknown as pg.QueryResult);
    expect(anon.rows[0].n).toBe(0);
  });

  it('a participant may SELECT its messages; a third user may not', async () => {
    const buyer = await runAs(
      BUYER,
      'SELECT count(*)::int n FROM messages WHERE conversation_id = $1',
      [convId],
    );
    expect(buyer.rows[0].n).toBeGreaterThanOrEqual(1);

    const other = await runAs(
      OTHER,
      'SELECT count(*)::int n FROM messages WHERE conversation_id = $1',
      [convId],
    );
    expect(other.rows[0].n).toBe(0);
  });

  it('a user cannot INSERT a message or conversation directly (no write grant)', async () => {
    await expect(
      runAs(
        BUYER,
        `INSERT INTO messages (id, conversation_id, sender_profile_id, body, created_at)
         VALUES (gen_random_uuid(), $1, $2, 'sneaky', now())`,
        [convId, BUYER],
      ),
    ).rejects.toThrow();

    await expect(
      runAs(
        BUYER,
        `INSERT INTO conversations (id, listing_id, buyer_profile_id, seller_profile_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, now())`,
        [publishedId, BUYER, SELLER],
      ),
    ).rejects.toThrow();
  });
});

describe('schema drift + indexes (migration 0013 matches the models)', () => {
  it('prisma migrate diff reports NO managed changes for messaging tables', () => {
    const diff = execSync(
      `npx prisma migrate diff --from-url "${url}" --to-schema-datamodel prisma/schema.prisma --script`,
      { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } },
    );
    // Prisma may still want to drop the raw 0012 search indexes it does not know
    // about, but it must NOT propose any change to conversations/messages -- that
    // would mean the hand-written 0013 diverged from the schema.
    expect(diff).not.toMatch(/conversations/i);
    expect(diff).not.toMatch(/\bmessages\b/i);
  });

  it('the keyset indexes exist', async () => {
    const { rows } = await sql.query(
      `SELECT indexname FROM pg_indexes WHERE tablename IN ('conversations','messages')`,
    );
    const names = rows.map((r: { indexname: string }) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'conversations_identity_key',
        'conversations_buyer_activity_idx',
        'conversations_seller_activity_idx',
        'messages_conversation_chrono_idx',
      ]),
    );
  });

  it('EXPLAIN runs for the message keyset query', async () => {
    const convId = (
      await svc.getOrCreateConversationForListing(BUYER, publishedId)
    ).id;
    const { rows } = await sql.query(
      `EXPLAIN (ANALYZE, FORMAT TEXT)
       SELECT id, body, created_at FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC LIMIT 31`,
      [convId],
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
