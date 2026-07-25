/**
 * Live Supabase Storage verification for listing images.
 *
 *   npm run storage:verify-listing-images
 *
 * Exercises the REAL private bucket end-to-end for the storage-owned steps of
 * the 2C checkpoint, using an isolated, self-cleaning `__verify__/` key so it
 * never touches real listings or the `listing_images` table:
 *
 *   1. process a generated JPEG (EXIF orientation) exactly as the app does
 *      (sharp: rotate → resize ≤1600 → WebP);
 *   2. upload the optimised WebP to the private bucket;
 *   3. download it back and confirm it is WebP, ≤1600px, EXIF stripped;
 *   4. sign a short URL and confirm it renders (HTTP 200);
 *   5. sign a 1s URL, wait, and confirm it EXPIRES (non-200);
 *   6. delete the object and confirm it is gone.
 *
 * The DB-row / reorder / cover / row-deletion steps are proven by the automated
 * integration suite (fake adapter) and are observed in the app UI; see the
 * checkpoint report. Runs under plain tsx, so it uses a direct Supabase client
 * and calls sharp directly (mirroring modules/catalog/image-processing.ts)
 * rather than importing the app's `server-only` modules.
 *
 * Safety: prints STATUS ONLY — never signed URLs, keys beyond the random suffix,
 * or credentials.
 */
import 'dotenv/config';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { IMAGE_BUCKET } from '@/modules/catalog/image-config';

const PLACEHOLDER =
  /localhost|example\.com|test-project|your-project|placeholder/i;

function pass(step: string): void {
  console.log(`  ✓ ${step}`);
}
function fail(step: string, detail: string): never {
  console.error(`  ✗ ${step} — ${detail}`);
  process.exit(1);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || PLACEHOLDER.test(url)) {
    fail('config', 'Supabase not configured with a real project (check .env).');
  }

  const supabase = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bucket = supabase.storage.from(IMAGE_BUCKET);

  // 1. Generate + process (rotate strips EXIF & normalises orientation).
  const source = await sharp({
    create: {
      width: 2000,
      height: 1500,
      channels: 3,
      background: { r: 180, g: 120, b: 90 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const processed = await sharp(source)
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  pass('processed a test image to WebP');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  const objectKey = `__verify__/${suffix}.webp`;

  // 2. Upload.
  {
    const { error } = await bucket.upload(objectKey, processed, {
      contentType: 'image/webp',
      upsert: false,
    });
    if (error) fail('upload', error.message);
    pass('uploaded object to the private bucket');
  }

  try {
    // 3. Download + verify it is an optimised, metadata-stripped WebP.
    {
      const { data, error } = await bucket.download(objectKey);
      if (error || !data) fail('download', error?.message ?? 'no data');
      const buf = Buffer.from(await data!.arrayBuffer());
      const meta = await sharp(buf).metadata();
      if (meta.format !== 'webp') fail('verify-format', `got ${meta.format}`);
      if (Math.max(meta.width ?? 0, meta.height ?? 0) > 1600)
        fail('verify-size', `${meta.width}x${meta.height}`);
      if (meta.exif) fail('verify-exif', 'EXIF present');
      pass(`stored WebP is ${meta.width}x${meta.height}, EXIF stripped`);
    }

    // 4. Signed URL renders.
    {
      const { data, error } = await bucket.createSignedUrl(objectKey, 60);
      if (error || !data?.signedUrl) fail('sign', error?.message ?? 'no url');
      const res = await fetch(data!.signedUrl);
      if (res.status !== 200) fail('signed-fetch', `HTTP ${res.status}`);
      pass('signed URL renders (HTTP 200)');
    }

    // 5. Signed URL expires.
    {
      const { data, error } = await bucket.createSignedUrl(objectKey, 1);
      if (error || !data?.signedUrl)
        fail('sign-short', error?.message ?? 'no url');
      await sleep(2500);
      const res = await fetch(data!.signedUrl);
      if (res.status === 200) fail('expiry', 'URL still valid after TTL');
      pass(`signed URL expired after TTL (HTTP ${res.status})`);
    }
  } finally {
    // 6. Delete (always attempt cleanup).
    const { error } = await bucket.remove([objectKey]);
    if (error) fail('delete', error.message);
    const { data } = await bucket.list('__verify__');
    const stillThere = (data ?? []).some((f) => f.name === `${suffix}.webp`);
    if (stillThere) fail('delete-verify', 'object still present after remove');
    pass('deleted object and confirmed removal');
  }

  console.log('\nLive storage verification PASSED.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
