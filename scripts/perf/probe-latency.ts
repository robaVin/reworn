/**
 * Latency probe — measures each server-side span against the REAL Supabase
 * (Auth, Postgres via Prisma, Storage) so we can see where authenticated
 * request time actually goes, independent of Next.js dev compilation.
 *
 *   npm run perf:probe
 *
 * Runs OUTSIDE Next (plain tsx): builds its own clients rather than importing
 * the app's `server-only` modules, but issues the SAME queries. Writes are a
 * single temp draft that is deleted afterwards. Prints only span name + ms and
 * non-sensitive counts — never ids, tokens, emails, URLs, or listing contents.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const IMAGE_BUCKET = 'listing-images';

const WARMUP = 5;
const SAMPLES = 20;

function pct(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/**
 * Time `fn`: discard `WARMUP` samples (pool/plan warm-up), then measure
 * `SAMPLES` sequential runs. Reports median + p95 (identical conditions).
 */
async function bench(name: string, fn: () => Promise<unknown>): Promise<void> {
  for (let i = 0; i < WARMUP; i++) await fn();
  const runs: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = performance.now();
    await fn();
    runs.push(performance.now() - t);
  }
  const s = [...runs].sort((a, b) => a - b);
  console.log(
    `  ${name.padEnd(22)} n=${SAMPLES} median=${pct(s, 0.5).toFixed(
      1,
    )}ms p95=${pct(s, 0.95).toFixed(1)}ms min=${s[0]!.toFixed(1)}ms`,
  );
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !anon || !service) {
    throw new Error('Supabase env missing (.env).');
  }

  const prisma = new PrismaClient();
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const seller = await prisma.sellerProfile.findFirst({
      where: { status: 'active' },
    });
    if (!seller) throw new Error('No active seller to probe. Provision one.');

    console.log('Supabase latency probe (real infra)\n');

    // getUser floor: no session → GoTrue round-trip only (auth server RTT).
    await bench('auth.getUser (anon)', () => anonClient.auth.getUser());

    // Run the SAME Prisma read queries through both endpoints to separate
    // connection-mode overhead from query cost.
    const directUrl = (process.env.DIRECT_URL ?? '').replace(/^"|"$/g, '');
    const prismaDirect = new PrismaClient({ datasourceUrl: directUrl });

    for (const [tag, client] of [
      ['pooler :6543 pgbouncer', prisma],
      ['direct :5432 session', prismaDirect],
    ] as const) {
      console.log(`\n  [${tag}]`);
      for (let i = 0; i < 10; i++) await client.$queryRaw`SELECT 1`; // warm pool
      await bench('db.roles', () =>
        client.userRole.findMany({
          where: { profileId: seller.profileId },
          include: { role: true },
        }),
      );
      await bench('db.seller', () =>
        client.sellerProfile.findUnique({
          where: { profileId: seller.profileId },
        }),
      );
      await bench('db.subscription', () =>
        client.subscription.findFirst({
          where: {
            sellerId: seller.id,
            status: { in: ['active', 'grace_period'] },
          },
          select: { id: true },
        }),
      );
      await bench('db.cards', () =>
        client.listing.findMany({
          where: { sellerId: seller.id },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 200,
          select: {
            id: true,
            title: true,
            status: true,
            priceMinor: true,
            currency: true,
            updatedAt: true,
            images: {
              orderBy: [{ position: 'asc' }],
              take: 1,
              select: { storageKey: true },
            },
          },
        }),
      );
    }
    await prismaDirect.$disconnect();
    console.log('');

    // --- Storage signing: single-per-key vs batched ---
    const someKeys = (
      await prisma.listingImage.findMany({
        take: 5,
        select: { storageKey: true },
      })
    ).map((r) => r.storageKey);
    if (someKeys.length > 0) {
      await bench(`storage.sign x${someKeys.length} (loop)`, async () => {
        for (const k of someKeys) {
          await admin.storage.from(IMAGE_BUCKET).createSignedUrl(k, 3600);
        }
      });
      await bench(`storage.sign x${someKeys.length} (batch)`, () =>
        admin.storage.from(IMAGE_BUCKET).createSignedUrls(someKeys, 3600),
      );
    } else {
      console.log('  (no images yet — skipping storage.sign)');
    }

    // --- Writes: bootstrap (create+delete) + autosave (single update) ---
    let tempId = '';
    await bench('db.bootstrap (create+del)', async () => {
      const row = await prisma.listing.create({
        data: {
          sellerId: seller.id,
          title: 'perf-probe (temp)',
          gender: 'unisex',
          currency: 'MKD',
          status: 'draft',
        },
        select: { id: true },
      });
      await prisma.listing.delete({ where: { id: row.id } });
      tempId = row.id;
    });
    // one persistent temp for autosave timing
    const temp = await prisma.listing.create({
      data: {
        sellerId: seller.id,
        title: 'perf-probe (temp)',
        gender: 'unisex',
        currency: 'MKD',
        status: 'draft',
      },
      select: { id: true },
    });
    tempId = temp.id;
    let toggle = 0;
    await bench('db.autosave (update)', () =>
      prisma.listing.update({
        where: { id: tempId },
        data: { description: `probe-${toggle++}` },
      }),
    );
    await prisma.listing.delete({ where: { id: tempId } });
    console.log('\n  (temp probe rows deleted)');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
