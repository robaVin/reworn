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

function stats(ms: number[]) {
  const s = [...ms].sort((a, b) => a - b);
  const median = s[Math.floor((s.length - 1) / 2)]!;
  return { min: Math.round(s[0]!), median: Math.round(median) };
}

/** Time `fn` n times; discard the first `warm` as cold (connect/pool). */
async function bench(
  name: string,
  fn: () => Promise<unknown>,
  n = 8,
  warm = 2,
): Promise<void> {
  const runs: number[] = [];
  let cold = 0;
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    const dt = performance.now() - t;
    if (i === 0) cold = dt;
    if (i >= warm) runs.push(dt);
  }
  const { min, median } = stats(runs);
  console.log(
    `  ${name.padEnd(22)} warm min=${String(min).padStart(4)}ms  median=${String(
      median,
    ).padStart(4)}ms   (cold first=${Math.round(cold)}ms)`,
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

    // --- Auth ---
    // getUser floor: no session → GoTrue round-trip only (auth server RTT).
    await bench('auth.getUser (anon)', () => anonClient.auth.getUser());

    // --- DB (Prisma over the pooled DATABASE_URL) ---
    await bench('db.roles', () =>
      prisma.userRole.findMany({
        where: { profileId: seller.profileId },
        include: { role: true },
      }),
    );
    await bench('db.seller', () =>
      prisma.sellerProfile.findUnique({
        where: { profileId: seller.profileId },
      }),
    );
    await bench('db.subscription', () =>
      prisma.subscription.findFirst({
        where: {
          sellerId: seller.id,
          status: { in: ['active', 'grace_period'] },
        },
        select: { id: true },
      }),
    );
    await bench('db.cards', () =>
      prisma.listing.findMany({
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

    // --- Storage signing: single-per-key vs batched ---
    const someKeys = (
      await prisma.listingImage.findMany({
        take: 5,
        select: { storageKey: true },
      })
    ).map((r) => r.storageKey);
    if (someKeys.length > 0) {
      await bench(
        `storage.sign x${someKeys.length} (loop)`,
        async () => {
          for (const k of someKeys) {
            await admin.storage.from(IMAGE_BUCKET).createSignedUrl(k, 3600);
          }
        },
        6,
      );
      await bench(
        `storage.sign x${someKeys.length} (batch)`,
        () => admin.storage.from(IMAGE_BUCKET).createSignedUrls(someKeys, 3600),
        6,
      );
    } else {
      console.log('  (no images yet — skipping storage.sign)');
    }

    // --- Writes: bootstrap + autosave on a temp draft, then delete ---
    let tempId = '';
    await bench(
      'db.bootstrap (create)',
      async () => {
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
        // delete immediately so we measure create cost repeatedly & leave nothing
        await prisma.listing.delete({ where: { id: row.id } });
        tempId = row.id;
      },
      6,
    );
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
    await bench(
      'db.autosave (update)',
      () =>
        prisma.listing.update({
          where: { id: tempId },
          data: { description: `probe-${toggle++}` },
        }),
      8,
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
