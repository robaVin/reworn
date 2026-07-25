/**
 * Connection-endpoint RTT benchmark (rigorous).
 *
 *   npm run perf:rtt
 *
 * Compares the two configured endpoints (DATABASE_URL vs DIRECT_URL) under
 * IDENTICAL conditions so the comparison is fair:
 *   - ONE long-lived client per endpoint (connected once, never reconnected)
 *   - a warm-up phase that is discarded
 *   - >= 20 measured samples
 *   - the same trivial query (`SELECT 1`), fully sequential (no concurrency)
 *   - reports median AND p95
 *
 * Prints only endpoint host:port + timings — never the user, password, or full
 * connection string.
 */
import 'dotenv/config';
import pg from 'pg';

const WARMUP = 5;
const SAMPLES = 25;

function pct(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/** host:port only — never credentials. */
function safeLabel(conn: string): string {
  try {
    const u = new URL(conn);
    return `${u.hostname}:${u.port || '5432'}${u.search ? ' ' + u.search : ''}`;
  } catch {
    return '<unparseable>';
  }
}

async function bench(name: string, conn: string): Promise<void> {
  if (!conn) {
    console.log(`${name}: (not set)`);
    return;
  }
  const client = new pg.Client({ connectionString: conn });
  const t0 = performance.now();
  await client.connect();
  const connectMs = performance.now() - t0;
  try {
    for (let i = 0; i < WARMUP; i++) await client.query('SELECT 1');
    const runs: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t = performance.now();
      await client.query('SELECT 1');
      runs.push(performance.now() - t);
    }
    const sorted = [...runs].sort((a, b) => a - b);
    const median = pct(sorted, 0.5);
    const p95 = pct(sorted, 0.95);
    console.log(
      `${name.padEnd(20)} ${safeLabel(conn).padEnd(52)} ` +
        `n=${SAMPLES} connect=${Math.round(connectMs)}ms ` +
        `median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms ` +
        `min=${sorted[0]!.toFixed(1)}ms max=${sorted[sorted.length - 1]!.toFixed(1)}ms`,
    );
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const strip = (v?: string) => (v ?? '').replace(/^"|"$/g, '');
  console.log(
    `RTT benchmark — one long-lived client, ${WARMUP} warm-up, ${SAMPLES} samples, sequential SELECT 1\n`,
  );
  await bench('DATABASE_URL', strip(process.env.DATABASE_URL));
  await bench('DIRECT_URL', strip(process.env.DIRECT_URL));
  console.log(
    '\nNote: DATABASE_URL is the app runtime connection; DIRECT_URL is used for migrations.',
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
