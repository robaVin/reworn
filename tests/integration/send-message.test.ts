import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Message send integration: the action core (`resolveSendMessage`) for
 * authorization/validation/redirect mapping, and the service
 * (`sendConversationMessage`) for sender derivation, activity update, and the
 * durable submission-token idempotency added in migration 0015.
 */

const SELLER = 'ab111111-1111-1111-1111-111111111111';
const BUYER = 'ab222222-2222-2222-2222-222222222222';
const OTHER = 'ab333333-3333-3333-3333-333333333333';
const uuid = (n: number) =>
  `ab9${String(n).padStart(5, '0')}-0000-0000-0000-000000000000`;

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/messaging/service');
let core: typeof import('@/modules/messaging/conversation-actions');

let sellerProfileId: string;
let categoryId: string;

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
const startConv = async () =>
  (await svc.getOrCreateConversationForListing(BUYER, await publish('t'))).id;

beforeAll(async () => {
  PORT = await freePort();
  url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;
  dataDir = mkdtempSync(join(tmpdir(), 'rew-send-'));
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
      shopName: 'Send Shop',
      status: 'active',
      handle: 'send-shop',
    },
  });
  sellerProfileId = seller.id;
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('authorization', () => {
  let conv: string;
  beforeAll(async () => {
    conv = await startConv();
  });

  it('buyer and seller can send (redirect to the bare latest thread, no cursor)', async () => {
    const b = await core.resolveSendMessage(BUYER, conv, 'from buyer', uuid(1));
    expect(b).toEqual({ kind: 'redirect', to: `/messages/${conv}` });
    expect(b.kind === 'redirect' && b.to.includes('cursor')).toBe(false);

    const s = await core.resolveSendMessage(
      SELLER,
      conv,
      'from seller',
      uuid(2),
    );
    expect(s).toEqual({ kind: 'redirect', to: `/messages/${conv}` });
  });

  it('a third user, unknown, and malformed conversation all map to notFound', async () => {
    for (const [u, c] of [
      [OTHER, conv],
      [BUYER, '00000000-0000-0000-0000-000000000000'],
      [BUYER, 'not-a-uuid'],
    ] as const) {
      expect(await core.resolveSendMessage(u, c, 'hi', uuid(3))).toEqual({
        kind: 'error',
        error: 'notFound',
      });
    }
  });
});

describe('validation (via the canonical normalizer in the service)', () => {
  let conv: string;
  beforeAll(async () => {
    conv = await startConv();
  });

  it('rejects empty, whitespace-only, control chars, and over-limit', async () => {
    expect(
      (await core.resolveSendMessage(BUYER, conv, '', uuid(10))).kind,
    ).toBe('error');
    expect(await core.resolveSendMessage(BUYER, conv, '   ', uuid(11))).toEqual(
      {
        kind: 'error',
        error: 'empty',
      },
    );
    expect(
      await core.resolveSendMessage(
        BUYER,
        conv,
        `a${String.fromCharCode(7)}b`,
        uuid(12),
      ),
    ).toEqual({ kind: 'error', error: 'controlChar' });
    expect(
      await core.resolveSendMessage(BUYER, conv, 'x'.repeat(4001), uuid(13)),
    ).toEqual({ kind: 'error', error: 'tooLong' });
  });

  it('accepts exactly 4000 code points, normalises newlines, keeps text literal', async () => {
    expect(
      (await core.resolveSendMessage(BUYER, conv, 'x'.repeat(4000), uuid(14)))
        .kind,
    ).toBe('redirect');

    const crlf = await svc.sendConversationMessage(
      BUYER,
      conv,
      '  a\r\nb\r\n\r\nc  ',
      uuid(15),
    );
    expect(crlf.body).toBe('a\nb\n\nc'); // trimmed + LF, internal newlines kept

    const html = await svc.sendConversationMessage(
      BUYER,
      conv,
      '<b>hi</b> & <script>x</script>',
      uuid(16),
    );
    expect(html.body).toBe('<b>hi</b> & <script>x</script>'); // stored literally
  });
});

describe('success effects', () => {
  it('inserts once, derives the sender from auth, and bumps activity', async () => {
    const conv = await startConv();
    const before = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv },
      select: { lastMessageAt: true },
    });
    const dto = await svc.sendConversationMessage(
      BUYER,
      conv,
      'hello',
      uuid(20),
    );

    const rows = await prisma.message.findMany({
      where: { conversationId: conv },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.senderProfileId).toBe(BUYER); // sender derived, not client-set
    expect(rows[0]!.id).toBe(dto.id);

    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv },
      select: { lastMessageAt: true },
    });
    expect(after.lastMessageAt.getTime()).toBe(rows[0]!.createdAt.getTime());
    expect(after.lastMessageAt.getTime()).toBeGreaterThanOrEqual(
      before.lastMessageAt.getTime(),
    );

    // The new message is visible on the latest thread page.
    const page = await svc.listRecentConversationMessages(BUYER, conv);
    expect(page.items.some((m) => m.id === dto.id)).toBe(true);
  });
});

describe('durable idempotency (submission token)', () => {
  it('sequential retries with the SAME token insert exactly one message', async () => {
    const conv = await startConv();
    const token = uuid(30);
    const a = await svc.sendConversationMessage(BUYER, conv, 'once', token);
    const b = await svc.sendConversationMessage(BUYER, conv, 'once', token);
    expect(b.id).toBe(a.id);
    expect(
      await prisma.message.count({ where: { conversationId: conv } }),
    ).toBe(1);
  });

  it('concurrent retries with the SAME token insert exactly one message', async () => {
    const conv = await startConv();
    const token = uuid(31);
    const [a, b] = await Promise.all([
      svc.sendConversationMessage(BUYER, conv, 'race', token),
      svc.sendConversationMessage(BUYER, conv, 'race', token),
    ]);
    expect(a.id).toBe(b.id);
    expect(
      await prisma.message.count({ where: { conversationId: conv } }),
    ).toBe(1);
  });

  it('different tokens create separate messages', async () => {
    const conv = await startConv();
    await svc.sendConversationMessage(BUYER, conv, 'one', uuid(32));
    await svc.sendConversationMessage(BUYER, conv, 'two', uuid(33));
    expect(
      await prisma.message.count({ where: { conversationId: conv } }),
    ).toBe(2);
  });

  it('the SAME token from the other participant does NOT collide (sender-scoped)', async () => {
    const conv = await startConv();
    const token = uuid(34);
    const buyerMsg = await svc.sendConversationMessage(BUYER, conv, 'b', token);
    const sellerMsg = await svc.sendConversationMessage(
      SELLER,
      conv,
      's',
      token,
    );
    expect(sellerMsg.id).not.toBe(buyerMsg.id);
    expect(
      await prisma.message.count({ where: { conversationId: conv } }),
    ).toBe(2);
  });

  it('an idempotent retry does not double-bump conversation activity', async () => {
    const conv = await startConv();
    const token = uuid(35);
    await svc.sendConversationMessage(BUYER, conv, 'x', token);
    const msg = await prisma.message.findFirstOrThrow({
      where: { conversationId: conv },
    });
    const first = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv },
      select: { lastMessageAt: true },
    });
    // Retry (same token) inserts nothing, so activity is unchanged.
    await svc.sendConversationMessage(BUYER, conv, 'x', token);
    const second = await prisma.conversation.findUniqueOrThrow({
      where: { id: conv },
      select: { lastMessageAt: true },
    });
    expect(second.lastMessageAt.getTime()).toBe(first.lastMessageAt.getTime());
    expect(second.lastMessageAt.getTime()).toBe(msg.createdAt.getTime());
  });
});

describe('drift + privacy', () => {
  it('migrate diff proposes NO managed change for messages after 0015', () => {
    const diff = execSync(
      `npx prisma migrate diff --from-url "${url}" --to-schema-datamodel prisma/schema.prisma --script`,
      { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url } },
    );
    expect(diff).not.toMatch(/\bmessages\b/i);
    expect(diff).not.toMatch(/client_submission_id/i);
  }, 60_000);

  it('a sent-message DTO exposes no ids/internals', async () => {
    const conv = await startConv();
    const dto = await svc.sendConversationMessage(
      BUYER,
      conv,
      'privacy',
      uuid(40),
    );
    const blob = JSON.stringify(dto);
    for (const id of [BUYER, SELLER, sellerProfileId]) {
      expect(blob).not.toContain(id);
    }
    for (const key of ['senderProfileId', 'clientSubmissionId', 'profileId']) {
      expect(blob).not.toContain(key);
    }
  });
});
