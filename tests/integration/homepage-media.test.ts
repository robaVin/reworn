import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { StorageAdapter } from '@/modules/catalog/storage';

/**
 * Homepage-media integration tests against a REAL PostgreSQL (embedded). Covers:
 * migration 0021 applies; the safe-replacement ordering + compensation; visibility
 * of overrides; alt handling; and the lock-down RLS. Storage + Sharp are faked
 * (via the exposed seams) so the DATA/orchestration behavior is exercised
 * deterministically without a real bucket or the native binary.
 */

const ADMIN = 'c1111111-1111-1111-1111-111111111111';

let PORT: number;
let url: string;
let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/homepage-media/service');
let storageMod: typeof import('@/modules/catalog/storage');
let ImageProcessingError: typeof import('@/modules/catalog/image-processing').ImageProcessingError;
let ImageRejectedError: typeof import('@/modules/catalog/errors').ImageRejectedError;

/** In-memory storage double with controllable failure modes. */
class FakeStorage implements StorageAdapter {
  objects = new Map<string, Buffer>();
  failUpload = false;
  failRemoveKeys = new Set<string>();
  async upload(key: string, body: Buffer): Promise<void> {
    if (this.failUpload) throw new Error('upload_failed');
    this.objects.set(key, body);
  }
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) {
      if (this.failRemoveKeys.has(k)) throw new Error('remove_failed');
      this.objects.delete(k);
    }
  }
  async createSignedUrl(key: string): Promise<string> {
    return `sign://${key}`;
  }
  async createSignedUrls(keys: string[]): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    for (const k of keys) if (this.objects.has(k)) m.set(k, `sign://${k}`);
    return m;
  }
  async list(): Promise<{ key: string; createdAt: Date | null }[]> {
    return [...this.objects.keys()].map((key) => ({ key, createdAt: null }));
  }
}

let fake: FakeStorage;

function jpegBytes(n = 128): Buffer {
  const b = Buffer.alloc(n, 0x20);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xe0;
  return b;
}
function pngBytes(n = 128): Buffer {
  const b = Buffer.alloc(n, 0x20);
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].forEach(
    (x, i) => (b[i] = x),
  );
  return b;
}

const okProcessor = async (input: Buffer) => ({
  buffer: input,
  width: 1200,
  height: 800,
  byteSize: input.byteLength,
  mimeType: 'image/webp',
});

async function runAs(
  identity: string | 'anon',
  text: string,
): Promise<pg.QueryResult> {
  await sql.query('BEGIN');
  try {
    if (identity === 'anon') await sql.query('SET LOCAL ROLE anon');
    else {
      await sql.query('SET LOCAL ROLE authenticated');
      await sql.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: identity }),
      ]);
    }
    const res = await sql.query(text);
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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-hpmedia-'));
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
  svc = await import('@/modules/homepage-media/service');
  storageMod = await import('@/modules/catalog/storage');
  ({ ImageProcessingError } =
    await import('@/modules/catalog/image-processing'));
  ({ ImageRejectedError } = await import('@/modules/catalog/errors'));

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  await prisma.profile.create({ data: { id: ADMIN } });
}, 180_000);

afterAll(async () => {
  svc.setHomepageImageProcessor(undefined);
  storageMod.setStorageAdapter(undefined);
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  fake = new FakeStorage();
  storageMod.setStorageAdapter(fake);
  svc.setHomepageImageProcessor(okProcessor);
  await prisma.homepageMedia.deleteMany({});
});

describe('resolveHomepageOverrides', () => {
  it('an empty table resolves to no overrides (homepage uses bundled fallbacks)', async () => {
    expect(await svc.resolveHomepageOverrides()).toEqual({});
  });
});

describe('replaceHomepageImage — success + resolution', () => {
  it('uploads, upserts, and resolves the new signed override', async () => {
    await svc.replaceHomepageImage(ADMIN, 'hero', {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
      alt: 'Colourful dress rack',
    });
    const row = await prisma.homepageMedia.findUniqueOrThrow({
      where: { slot: 'hero' },
    });
    expect(row.storageKey).toMatch(/^homepage\/hero\/.*\.webp$/);
    expect(row.altText).toBe('Colourful dress rack');
    expect(row.updatedById).toBe(ADMIN);
    expect(fake.objects.has(row.storageKey)).toBe(true);

    const resolved = await svc.resolveHomepageOverrides();
    expect(resolved.hero).toEqual({
      url: `sign://${row.storageKey}`,
      alt: 'Colourful dress rack',
    });
  });

  it('rejects a MIME/extension spoof (bytes vs declared type mismatch)', async () => {
    await expect(
      svc.replaceHomepageImage(ADMIN, 'hero', {
        bytes: pngBytes(), // real PNG bytes...
        declaredMime: 'image/jpeg', // ...declared as JPEG
        alt: 'x',
      }),
    ).rejects.toBeInstanceOf(ImageRejectedError);
    expect(await prisma.homepageMedia.count()).toBe(0);
  });

  it('rejects a malformed image (processor throws) and writes nothing', async () => {
    svc.setHomepageImageProcessor(async () => {
      throw new ImageProcessingError('undecodable');
    });
    await expect(
      svc.replaceHomepageImage(ADMIN, 'hero', {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
        alt: 'x',
      }),
    ).rejects.toBeInstanceOf(ImageRejectedError);
    expect(await prisma.homepageMedia.count()).toBe(0);
    expect(fake.objects.size).toBe(0);
  });

  it('rejects empty/oversized alt text', async () => {
    await expect(
      svc.replaceHomepageImage(ADMIN, 'hero', {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
        alt: '   ',
      }),
    ).rejects.toBeInstanceOf(ImageRejectedError);
    await expect(
      svc.replaceHomepageImage(ADMIN, 'hero', {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
        alt: 'a'.repeat(301),
      }),
    ).rejects.toBeInstanceOf(ImageRejectedError);
  });
});

describe('replaceHomepageImage — failure keeps the working image', () => {
  it('an UPLOAD failure changes nothing (old image unchanged)', async () => {
    // Seed a working override first.
    await svc.replaceHomepageImage(ADMIN, 'story', {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
      alt: 'Original',
    });
    const before = await prisma.homepageMedia.findUniqueOrThrow({
      where: { slot: 'story' },
    });

    fake.failUpload = true;
    await expect(
      svc.replaceHomepageImage(ADMIN, 'story', {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
        alt: 'Replacement',
      }),
    ).rejects.toThrow();

    const after = await prisma.homepageMedia.findUniqueOrThrow({
      where: { slot: 'story' },
    });
    expect(after.storageKey).toBe(before.storageKey);
    expect(after.altText).toBe('Original');
    expect(fake.objects.has(before.storageKey)).toBe(true);
  });

  it('a DB failure after upload removes the new orphan and leaves no row', async () => {
    // A non-existent updatedBy fails the FK on upsert -> DB throws AFTER upload.
    const ghost = randomUUID();
    await expect(
      svc.replaceHomepageImage(ghost, 'hero', {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
        alt: 'Would-be image',
      }),
    ).rejects.toThrow();

    expect(await prisma.homepageMedia.count()).toBe(0);
    // The just-uploaded object was compensated away (no orphan).
    expect(
      [...fake.objects.keys()].some((k) => k.startsWith('homepage/')),
    ).toBe(false);
  });

  it('an OLD-object cleanup failure still leaves the NEW override working', async () => {
    await svc.replaceHomepageImage(ADMIN, 'inside_1', {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
      alt: 'First',
    });
    const first = await prisma.homepageMedia.findUniqueOrThrow({
      where: { slot: 'inside_1' },
    });
    fake.failRemoveKeys.add(first.storageKey); // deleting the OLD object will fail

    await svc.replaceHomepageImage(ADMIN, 'inside_1', {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
      alt: 'Second',
    });

    const second = await prisma.homepageMedia.findUniqueOrThrow({
      where: { slot: 'inside_1' },
    });
    expect(second.storageKey).not.toBe(first.storageKey);
    expect(second.altText).toBe('Second');
    const resolved = await svc.resolveHomepageOverrides();
    expect(resolved.inside_1?.url).toBe(`sign://${second.storageKey}`);
    // Old object is a harmless orphan (removal failed), new one is live.
    expect(fake.objects.has(first.storageKey)).toBe(true);
    expect(fake.objects.has(second.storageKey)).toBe(true);
  });
});

describe('updateHomepageAlt', () => {
  it('updates alt for an existing override; fails when there is none', async () => {
    await expect(
      svc.updateHomepageAlt(ADMIN, 'story', 'no override yet'),
    ).rejects.toBeInstanceOf(ImageRejectedError);

    await svc.replaceHomepageImage(ADMIN, 'story', {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
      alt: 'Old alt',
    });
    await svc.updateHomepageAlt(ADMIN, 'story', 'New alt');
    const row = await prisma.homepageMedia.findUniqueOrThrow({
      where: { slot: 'story' },
    });
    expect(row.altText).toBe('New alt');
  });
});

describe('homepage_media RLS (privileged-path only)', () => {
  it('neither anon nor authenticated may read the table', async () => {
    await expect(
      runAs('anon', 'SELECT count(*) FROM homepage_media'),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      runAs(ADMIN, 'SELECT count(*) FROM homepage_media'),
    ).rejects.toThrow(/permission denied/i);
  });
});
