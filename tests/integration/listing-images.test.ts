import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { StorageAdapter } from '@/modules/catalog/storage';
import type { ProcessedImage } from '@/modules/catalog/image-processing';
import type { DraftListingInput } from '@/modules/catalog/schemas';

/**
 * Listing-image integration tests against a REAL PostgreSQL (embedded).
 *
 * Storage and image processing are seamed with in-memory fakes (per the 2C
 * requirement to use a fake storage adapter, not live Supabase Storage) so the
 * suite needs neither network nor the sharp native binary. Real sharp behaviour
 * (EXIF strip / orientation / resize) is covered separately in
 * tests/unit/image-processing.test.ts.
 *
 * Covers: valid upload, format/spoof/size rejection, dimension rejection, image
 * limit, ownership (buyer + cross-seller IDOR), deterministic ordering, cover =
 * position 0, deletion + renormalisation, reorder (+mismatch), storage-upload
 * failure (no DB row), DB-failure-after-upload (storage compensated), retry
 * cleanliness, non-editable listing rejection, and direct-DB write rejection
 * via RLS.
 */

const SELLER = 'a1111111-1111-1111-1111-111111111111';
const OTHER_SELLER = 'a2222222-2222-2222-2222-222222222222';
const BUYER = 'b1111111-1111-1111-1111-111111111111';
const ADMIN = 'c1111111-1111-1111-1111-111111111111';

const PORT = 54367;
const url = `postgresql://postgres:postgres@localhost:${PORT}/reworn`;

let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;
let categoryId: string;

let prisma: typeof import('@/lib/db').prisma;
let svc: typeof import('@/modules/catalog/listing-service');
let images: typeof import('@/modules/catalog/image-service');
let storageMod: typeof import('@/modules/catalog/storage');
let processingMod: typeof import('@/modules/catalog/image-processing');
let errors: typeof import('@/modules/catalog/errors');

/** In-memory storage adapter with injectable failure for compensation tests. */
class FakeStorage implements StorageAdapter {
  objects = new Map<string, Buffer>();
  failNextUpload = false;

  async upload(key: string, body: Buffer): Promise<void> {
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new storageMod.StorageError('upload_failed');
    }
    this.objects.set(key, body);
  }
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) this.objects.delete(k);
  }
  async createSignedUrl(key: string, ttl: number): Promise<string> {
    return `signed://${key}?ttl=${ttl}`;
  }
}

let fakeStorage: FakeStorage;

/** Default fake processor: pretends to produce a valid 1200×1200 WebP. */
const okProcessor = async (): Promise<ProcessedImage> => ({
  buffer: Buffer.from('processed-webp-bytes'),
  width: 1200,
  height: 1200,
  byteSize: 20,
  mimeType: 'image/webp',
});

/** Valid-looking JPEG upload bytes (magic + padding). Content is irrelevant to
 * the fake processor; the magic bytes must pass real signature validation. */
function jpegBytes(padding = 256): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
    Buffer.alloc(padding, 0x11),
  ]);
}
function pngBytes(padding = 256): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(padding, 0x22),
  ]);
}
function gifBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    Buffer.alloc(64, 0x33),
  ]);
}

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

async function newDraft(owner = SELLER) {
  return svc.createDraftListing(owner, baseInput());
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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-images-'));
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
  images = await import('@/modules/catalog/image-service');
  storageMod = await import('@/modules/catalog/storage');
  processingMod = await import('@/modules/catalog/image-processing');
  errors = await import('@/modules/catalog/errors');

  fakeStorage = new FakeStorage();
  storageMod.setStorageAdapter(fakeStorage);
  images.setImageProcessor(okProcessor);

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const sellerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'seller' },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'admin' },
  });
  categoryId = (await prisma.category.findFirstOrThrow()).id;

  await prisma.profile.createMany({
    data: [SELLER, OTHER_SELLER, BUYER, ADMIN].map((id) => ({ id })),
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: SELLER, roleId: sellerRole.id },
      { profileId: OTHER_SELLER, roleId: sellerRole.id },
      { profileId: BUYER, roleId: buyerRole.id },
      { profileId: ADMIN, roleId: adminRole.id },
    ],
    skipDuplicates: true,
  });
  await prisma.sellerProfile.createMany({
    data: [
      { profileId: SELLER, shopName: 'Seller Shop', status: 'active' },
      { profileId: OTHER_SELLER, shopName: 'Other Shop', status: 'active' },
    ],
    skipDuplicates: true,
  });
}, 180_000);

afterEach(() => {
  // Reset injected failure/processor state between tests.
  fakeStorage.failNextUpload = false;
  images.setImageProcessor(okProcessor);
});

afterAll(async () => {
  storageMod.setStorageAdapter(undefined);
  images.setImageProcessor(undefined);
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('addListingImage — happy path & validation', () => {
  it('adds a valid image at position 0 and stores the object', async () => {
    const draft = await newDraft();
    const img = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    expect(img.position).toBe(0);
    expect(img.mimeType).toBe('image/webp');
    expect(img.storageKey.startsWith(`${draft.id}/`)).toBe(true);
    expect(img.storageKey.endsWith('.webp')).toBe(true);
    expect(fakeStorage.objects.has(img.storageKey)).toBe(true);
  });

  it('rejects a GIF (unsupported format)', async () => {
    const draft = await newDraft();
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: gifBytes(),
        declaredMime: 'image/gif',
      }),
    ).rejects.toBeInstanceOf(errors.ImageRejectedError);
  });

  it('rejects a spoofed MIME (PNG bytes declared as JPEG)', async () => {
    const draft = await newDraft();
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: pngBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ reason: 'mime_signature_mismatch' });
  });

  it('rejects an oversized upload', async () => {
    const draft = await newDraft();
    const oversized = Buffer.concat([
      jpegBytes(0),
      Buffer.alloc(8 * 1024 * 1024 + 1, 0),
    ]);
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: oversized,
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ reason: 'too_large' });
  });

  it('rejects insufficient dimensions (processor says too_small)', async () => {
    images.setImageProcessor(async () => {
      throw new processingMod.ImageProcessingError('too_small');
    });
    const draft = await newDraft();
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ reason: 'too_small' });
    // Nothing persisted or stored.
    expect(
      await prisma.listingImage.count({ where: { listingId: draft.id } }),
    ).toBe(0);
  });

  it('enforces the per-listing image limit', async () => {
    const draft = await newDraft();
    for (let i = 0; i < 8; i++) {
      await images.addListingImage(SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      });
    }
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(errors.ImageLimitError);
    expect(
      await prisma.listingImage.count({ where: { listingId: draft.id } }),
    ).toBe(8);
  });

  it('refuses to attach images to a non-editable (published) listing', async () => {
    const draft = await svc.createDraftListing(SELLER, baseInput());
    await svc.transitionListing(SELLER, draft.id, 'publish');
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(errors.ListingConflictError);
  });
});

describe('ownership / IDOR', () => {
  it('a buyer (no seller profile) cannot add images (404 hides existence)', async () => {
    const draft = await newDraft();
    await expect(
      images.addListingImage(BUYER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('another seller cannot add, reorder, or delete on a listing they do not own', async () => {
    const draft = await newDraft(SELLER);
    const img = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    await expect(
      images.addListingImage(OTHER_SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      images.reorderListingImages(OTHER_SELLER, draft.id, [img.id]),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      images.deleteListingImage(OTHER_SELLER, img.id),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('ordering, cover, reorder, deletion', () => {
  it('assigns deterministic positions and treats position 0 as cover', async () => {
    const draft = await newDraft();
    const a = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    const b = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    const c = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    expect([a.position, b.position, c.position]).toEqual([0, 1, 2]);

    const view = await images.getListingImagesForViewer(
      { userId: SELLER, roles: ['seller'] },
      draft.id,
    );
    expect(view.map((v) => v.id)).toEqual([a.id, b.id, c.id]);
    expect(view[0]!.position).toBe(0); // cover
    expect(view[0]!.url).toContain('signed://');
  });

  it('reorders to a valid permutation (new cover) and rejects a mismatch', async () => {
    const draft = await newDraft();
    const a = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    const b = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    await images.reorderListingImages(SELLER, draft.id, [b.id, a.id]);
    const view = await images.getListingImagesForViewer(
      { userId: SELLER, roles: ['seller'] },
      draft.id,
    );
    expect(view.map((v) => v.id)).toEqual([b.id, a.id]);

    // Not a permutation of the listing's images → rejected, order unchanged.
    await expect(
      images.reorderListingImages(SELLER, draft.id, [b.id]),
    ).rejects.toBeInstanceOf(errors.ImageRejectedError);
    await expect(
      images.reorderListingImages(SELLER, draft.id, [
        b.id,
        '00000000-0000-0000-0000-000000000000',
      ]),
    ).rejects.toBeInstanceOf(errors.ImageRejectedError);
  });

  it('deletes an image, renumbers remaining to 0..n-1, and removes the object', async () => {
    const draft = await newDraft();
    const a = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    const b = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    const c = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    await images.deleteListingImage(SELLER, b.id);

    expect(fakeStorage.objects.has(b.storageKey)).toBe(false);
    const view = await images.getListingImagesForViewer(
      { userId: SELLER, roles: ['seller'] },
      draft.id,
    );
    expect(view.map((v) => v.id)).toEqual([a.id, c.id]);
    expect(view.map((v) => v.position)).toEqual([0, 1]);
  });
});

describe('compensation & retry safety', () => {
  it('storage upload failure leaves no DB row', async () => {
    const draft = await newDraft();
    fakeStorage.failNextUpload = true;
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(storageMod.StorageError);
    expect(
      await prisma.listingImage.count({ where: { listingId: draft.id } }),
    ).toBe(0);

    // Retry is clean: succeeds and leaves exactly one row + one object.
    const img = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });
    expect(
      await prisma.listingImage.count({ where: { listingId: draft.id } }),
    ).toBe(1);
    expect(fakeStorage.objects.has(img.storageKey)).toBe(true);
  });

  it('DB failure after a successful upload compensates the stored object', async () => {
    const draft = await newDraft();
    const before = fakeStorage.objects.size;
    // Processor returns width 0 → violates the width>0 CHECK → DB insert fails
    // AFTER the object is uploaded. The service must remove the orphan.
    images.setImageProcessor(async () => ({
      buffer: Buffer.from('x'),
      width: 0,
      height: 1200,
      byteSize: 20,
      mimeType: 'image/webp',
    }));
    await expect(
      images.addListingImage(SELLER, draft.id, {
        bytes: jpegBytes(),
        declaredMime: 'image/jpeg',
      }),
    ).rejects.toBeTruthy();

    expect(
      await prisma.listingImage.count({ where: { listingId: draft.id } }),
    ).toBe(0);
    // No net new object survived (uploaded then compensated).
    expect(fakeStorage.objects.size).toBe(before);
  });
});

describe('direct DB write rejection (RLS)', () => {
  it('an authenticated user cannot INSERT/UPDATE/DELETE listing_images directly', async () => {
    // Need a real image + listing to target for UPDATE/DELETE.
    const draft = await newDraft();
    const img = await images.addListingImage(SELLER, draft.id, {
      bytes: jpegBytes(),
      declaredMime: 'image/jpeg',
    });

    await expect(
      runAs(
        SELLER,
        `INSERT INTO listing_images (id, listing_id, storage_key, position, width, height, byte_size, mime_type)
         VALUES (gen_random_uuid(), $1, 'k/x.webp', 0, 100, 100, 10, 'image/webp')`,
        [draft.id],
      ),
    ).rejects.toThrow();

    await expect(
      runAs(SELLER, 'UPDATE listing_images SET position = 5 WHERE id = $1', [
        img.id,
      ]),
    ).rejects.toThrow();

    await expect(
      runAs(SELLER, 'DELETE FROM listing_images WHERE id = $1', [img.id]),
    ).rejects.toThrow();

    // Admin/owner read path still works via the service (defence in depth).
    const adminView = await images.getListingImagesForViewer(
      { userId: ADMIN, roles: ['admin'] },
      draft.id,
    );
    expect(adminView.length).toBe(1);
  });
});
