/**
 * Listing-image storage reconciliation command.
 *
 *   npm run storage:reconcile-listing-images             # dry run (default)
 *   npm run storage:reconcile-listing-images -- --delete # remove safe orphans
 *   npm run storage:reconcile-listing-images -- --min-age-hours 6
 *
 * Compares the private Supabase Storage bucket with `listing_images` and reports:
 *   - MISSING objects  : DB rows whose object is gone (reported only, never
 *                        auto-deleted — needs human attention).
 *   - ORPHAN objects   : stored files with no DB row, older than the age
 *                        threshold; removable with --delete.
 *   - SKIPPED (recent) : orphan candidates too new to be safe (possibly a
 *                        still-in-flight upload) — never deleted.
 *
 * Runs OUTSIDE the Next.js runtime (plain tsx), so it deliberately builds its own
 * Prisma + Supabase clients rather than importing the app's `server-only`
 * modules. It shares the app's PURE reconciliation logic (`image-reconcile.ts`).
 *
 * Safety:
 *   - DRY RUN by default; deletion requires the explicit `--delete` flag.
 *   - Refuses to run unless Supabase is really configured (no placeholder env).
 *   - Only object storage KEYS are logged (random UUIDs — no PII, credentials,
 *     or signed URLs).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { IMAGE_BUCKET } from '@/modules/catalog/image-config';
import {
  reconcileListingImages,
  type ReconcileRunResult,
} from '@/modules/catalog/image-reconcile';
import type { StorageObjectInfo } from '@/modules/catalog/storage';

function flag(name: string): boolean {
  return process.argv.slice(2).includes(`--${name}`);
}
function value(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith('--'))
    return argv[i + 1];
  return undefined;
}

const PLACEHOLDER =
  /localhost|example\.com|test-project|your-project|placeholder/i;

function assertConfigured(
  url: string | undefined,
  key: string | undefined,
): void {
  if (!url || !key || PLACEHOLDER.test(url)) {
    throw new Error(
      'Refusing to reconcile: Supabase is not configured with a real project ' +
        '(missing or placeholder NEXT_PUBLIC_SUPABASE_URL / ' +
        'SUPABASE_SERVICE_ROLE_KEY). This command must target the real bucket.',
    );
  }
}

/** Enumerates `<listingId>/<file>` objects in the private bucket (paginated). */
async function listBucket(
  storage: ReturnType<typeof createClient>['storage'],
): Promise<StorageObjectInfo[]> {
  const bucket = storage.from(IMAGE_BUCKET);
  const pageSize = 100;
  const out: StorageObjectInfo[] = [];

  const listAll = async (path: string) => {
    const acc: Array<{ id: string | null; name: string; created_at?: string }> =
      [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await bucket.list(path, {
        limit: pageSize,
        offset,
      });
      if (error) throw new Error(`storage list failed: ${error.message}`);
      const page = data ?? [];
      acc.push(...(page as typeof acc));
      if (page.length < pageSize) break;
    }
    return acc;
  };

  for (const folder of await listAll('')) {
    if (folder.id === null) {
      for (const file of await listAll(folder.name)) {
        if (file.id === null) continue;
        out.push({
          key: `${folder.name}/${file.name}`,
          createdAt: file.created_at ? new Date(file.created_at) : null,
        });
      }
    } else {
      out.push({
        key: folder.name,
        createdAt: folder.created_at ? new Date(folder.created_at) : null,
      });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assertConfigured(url, serviceKey);

  const del = flag('delete');
  const minAgeHours = Number(value('min-age-hours') ?? '24');
  if (!Number.isFinite(minAgeHours) || minAgeHours < 0) {
    throw new Error('--min-age-hours must be a non-negative number.');
  }
  const minAgeMs = minAgeHours * 3_600_000;

  const prisma = new PrismaClient();
  const supabase = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const rows = await prisma.listingImage.findMany({
      select: { storageKey: true },
    });

    const result: ReconcileRunResult = await reconcileListingImages({
      adapter: {
        list: () => listBucket(supabase.storage),
        remove: async (keys: string[]) => {
          if (keys.length === 0) return;
          const { error } = await supabase.storage
            .from(IMAGE_BUCKET)
            .remove(keys);
          if (error) throw new Error(`storage remove failed: ${error.message}`);
        },
      },
      dbStorageKeys: rows.map((r) => r.storageKey),
      now: Date.now(),
      minAgeMs,
      del,
    });

    // Keys are random UUIDs: safe to print. Never print signed URLs or secrets.
    console.log('listing-image storage reconciliation');
    console.log(`  mode              : ${del ? 'DELETE' : 'dry-run'}`);
    console.log(`  min object age    : ${minAgeHours}h`);
    console.log(`  db rows           : ${result.dbRows}`);
    console.log(`  storage objects   : ${result.scannedObjects}`);
    console.log(`  missing objects   : ${result.missingObjects.length}`);
    result.missingObjects.forEach((k) => console.log(`    - MISSING  ${k}`));
    console.log(`  orphan objects    : ${result.orphanObjects.length}`);
    result.orphanObjects.forEach((k) => console.log(`    - ORPHAN   ${k}`));
    console.log(`  skipped (recent)  : ${result.skippedRecent.length}`);
    console.log(`  deleted           : ${result.deleted.length}`);
    result.deleted.forEach((k) => console.log(`    - DELETED  ${k}`));

    if (!del && result.orphanObjects.length > 0) {
      console.log('\nRe-run with `-- --delete` to remove the orphan objects.');
    }
    if (result.missingObjects.length > 0) {
      console.log(
        '\nMISSING objects indicate DB rows without files — investigate ' +
          'manually; this command never deletes listing_images rows.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
