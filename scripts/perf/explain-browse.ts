/**
 * Browse query-plan harness. Boots a throwaway embedded PostgreSQL, applies the
 * real migrations, seeds a representative volume of PUBLISHED listings, ANALYZEs,
 * then runs EXPLAIN (ANALYZE, BUFFERS) on each browse query shape so we can see
 * which indexes are actually used. Prints plans and exits; touches nothing real.
 *
 *   npm run perf:explain
 */
import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import pg from 'pg';

const N = 50000;

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => res(p));
    });
  });
}

async function explain(sql: pg.Client, label: string, query: string) {
  const r = await sql.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING OFF) ${query}`);
  console.log(`\n### ${label}`);
  for (const row of r.rows) console.log('  ' + row['QUERY PLAN']);
}

async function main() {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'rew-explain-'));
  const url = `postgresql://postgres:postgres@localhost:${port}/reworn`;
  const server = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  });
  await server.initialise();
  await server.start();
  await server.createDatabase('reworn');

  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env });
  execSync('npx tsx prisma/seed.ts', { stdio: 'pipe', env });

  const sql = new pg.Client({ connectionString: url });
  await sql.connect();

  const profId = (
    await sql.query(
      `INSERT INTO profiles (id, created_at, updated_at)
       VALUES (gen_random_uuid(), now(), now()) RETURNING id`,
    )
  ).rows[0].id;
  const sellerId = (
    await sql.query(
      `INSERT INTO seller_profiles (id, profile_id, shop_name, handle, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Seed Shop', 'seed-shop', 'active', now(), now()) RETURNING id`,
      [profId],
    )
  ).rows[0].id;
  const cats = (
    await sql.query(`SELECT id, slug FROM categories ORDER BY sort_order`)
  ).rows;

  console.log(`Seeding ${N} published listings...`);
  await sql.query(
    `INSERT INTO listings
       (id, seller_id, category_id, title, description, brand, size, material,
        condition, gender, price_minor, currency, location, status,
        published_at, created_at, updated_at)
     SELECT gen_random_uuid(), $1,
       (ARRAY[$2::uuid, $3::uuid])[1 + (g % 2)],
       'Vintage item ' || g,
       'A ' || (ARRAY['wool','cotton','leather','silk','denim'])[1 + (g % 5)] || ' piece number ' || g,
       'Brand ' || (g % 60),
       (ARRAY['XS','S','M','L','XL'])[1 + (g % 5)],
       (ARRAY['wool','cotton','leather'])[1 + (g % 3)],
       (ARRAY['new','like_new','very_good','good','fair']::listing_condition[])[1 + (g % 5)],
       (ARRAY['women','men','kids','unisex']::listing_gender[])[1 + (g % 4)],
       500 + (g % 40000),
       'MKD',
       (ARRAY['skopje','bitola','ohrid','prilep'])[1 + (g % 4)],
       'published',
       now() - (g || ' minutes')::interval,
       now() - (g || ' minutes')::interval,
       now()
     FROM generate_series(1, ${N}) g`,
    [sellerId, cats[0].id, cats[1].id],
  );
  await sql.query('ANALYZE listings');

  const catSlug = cats[1].slug;
  console.log(`\n=== EXPLAIN (ANALYZE) — ${N} published listings ===`);

  await explain(
    sql,
    'newest, page 1',
    `SELECT l.id FROM listings l WHERE l.status='published'
     ORDER BY l.created_at DESC, l.id DESC LIMIT 25`,
  );
  await explain(
    sql,
    'newest, keyset page 2',
    `SELECT l.id FROM listings l WHERE l.status='published'
       AND (l.created_at, l.id) < (now() - interval '10 minutes', gen_random_uuid())
     ORDER BY l.created_at DESC, l.id DESC LIMIT 25`,
  );
  await explain(
    sql,
    'price_asc, page 1',
    `SELECT l.id FROM listings l WHERE l.status='published'
     ORDER BY l.price_minor ASC, l.id ASC LIMIT 25`,
  );
  await explain(
    sql,
    'category + newest (subquery on category_id)',
    `SELECT l.id FROM listings l
       LEFT JOIN categories c ON c.id = l.category_id
     WHERE l.status='published'
       AND l.category_id = (SELECT id FROM categories WHERE slug = '${catSlug}')
     ORDER BY l.created_at DESC, l.id DESC LIMIT 25`,
  );
  await explain(
    sql,
    'full-text search + relevance (SELECTIVE term)',
    `SELECT l.id, ts_rank(l.search_vector, websearch_to_tsquery('simple','4321')) r
     FROM listings l
     WHERE l.status='published'
       AND l.search_vector @@ websearch_to_tsquery('simple','4321')
     ORDER BY r DESC, l.id DESC LIMIT 25`,
  );
  await explain(
    sql,
    'full-text search + relevance',
    `SELECT l.id, ts_rank(l.search_vector, websearch_to_tsquery('simple','wool')) r
     FROM listings l
     WHERE l.status='published'
       AND l.search_vector @@ websearch_to_tsquery('simple','wool')
     ORDER BY r DESC, l.id DESC LIMIT 25`,
  );
  await explain(
    sql,
    'location equality (normalized)',
    `SELECT l.id FROM listings l
     WHERE l.status='published'
       AND lower(regexp_replace(btrim(l.location), '\\s+', ' ', 'g')) = 'skopje'
     ORDER BY l.created_at DESC, l.id DESC LIMIT 25`,
  );

  await sql.end();
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
