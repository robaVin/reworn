import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import EmbeddedPostgres from 'embedded-postgres';
import { freePort } from '../helpers/free-port';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import type { AuthContext } from '@/modules/auth/authorization';

/**
 * Integration tests against a REAL PostgreSQL (embedded).
 *
 * Covers: migrations 0001–0004 apply; profile provisioning is idempotent and
 * concurrency-safe; the role service enforces admin-only + last-admin +
 * self-escalation rules; and every scoped RLS policy behaves as documented for
 * anon / authenticated / admin.
 *
 * CI uses a Postgres service container; embedded-postgres keeps this runnable
 * locally without Docker. Planned removal noted in docs before release.
 */

// Deterministic fixture ids.
const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const ADMIN = '33333333-3333-3333-3333-333333333333';
const NEW_1 = '44444444-4444-4444-4444-444444444444';
const NEW_2 = '55555555-5555-5555-5555-555555555555';
// A pristine plain buyer used ONLY for non-owner RLS reads, never mutated by
// the role-service tests (which promote USER_B), so assertions stay isolated.
const USER_C = '66666666-6666-6666-6666-666666666666';

let PORT: number;
let url: string;

let server: EmbeddedPostgres;
let dataDir: string;
let sql: pg.Client;

// Dynamically imported after env is set so Prisma connects to the embedded DB.
let prisma: typeof import('@/lib/db').prisma;
let provisionProfile: typeof import('@/modules/auth/provisioning').provisionProfile;
let grantRole: typeof import('@/modules/auth/role-service').grantRole;
let revokeRole: typeof import('@/modules/auth/role-service').revokeRole;
let AuthorizationError: typeof import('@/modules/auth/errors').AuthorizationError;

/** Runs a query as a Supabase-style role with a simulated JWT `sub`. */
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
  dataDir = mkdtempSync(join(tmpdir(), 'rew-auth-'));
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
  ({ provisionProfile } = await import('@/modules/auth/provisioning'));
  ({ grantRole, revokeRole } = await import('@/modules/auth/role-service'));
  ({ AuthorizationError } = await import('@/modules/auth/errors'));

  sql = new pg.Client({ connectionString: url });
  await sql.connect();

  // ---- Fixtures (via Prisma = privileged, bypasses RLS) ----
  const buyerRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'buyer' },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { name: 'admin' },
  });
  const starter = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: 'starter' },
  });

  await prisma.profile.createMany({
    data: [{ id: USER_A }, { id: USER_B }, { id: ADMIN }, { id: USER_C }],
    skipDuplicates: true,
  });
  await prisma.userRole.createMany({
    data: [
      { profileId: USER_A, roleId: buyerRole.id },
      { profileId: USER_B, roleId: buyerRole.id },
      { profileId: USER_C, roleId: buyerRole.id },
      { profileId: ADMIN, roleId: buyerRole.id },
      { profileId: ADMIN, roleId: adminRole.id },
    ],
    skipDuplicates: true,
  });
  const sellerA = await prisma.sellerProfile.create({
    data: { profileId: USER_A, shopName: 'A Shop', handle: 'a-shop' },
  });
  await prisma.subscription.create({
    data: { sellerId: sellerA.id, planId: starter.id, status: 'pending' },
  });
  await prisma.paymentAttempt.create({
    data: {
      merchantReference: 'ref-A-1',
      profileId: USER_A,
      sellerId: sellerA.id,
      planId: starter.id,
      expectedAmountMinor: 30000,
      expectedCurrency: 'MKD',
      provider: 'mock',
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  await prisma.auditLog.create({
    data: { action: 'test.fixture', entityType: 'test' },
  });
}, 180_000);

afterAll(async () => {
  await sql?.end();
  await prisma?.$disconnect();
  await server?.stop();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe('profile provisioning', () => {
  it('is idempotent (second call is a no-op)', async () => {
    const first = await provisionProfile(NEW_1);
    expect(first).toEqual({ profileCreated: true, buyerRoleAssigned: true });

    const second = await provisionProfile(NEW_1);
    expect(second).toEqual({ profileCreated: false, buyerRoleAssigned: false });

    const roles = await prisma.userRole.count({ where: { profileId: NEW_1 } });
    expect(roles).toBe(1);
    const audits = await prisma.auditLog.count({
      where: { entityId: NEW_1, action: 'role.granted' },
    });
    expect(audits).toBe(1);
  });

  it('is concurrency-safe: parallel first requests create exactly one profile and one buyer role', async () => {
    await Promise.all(Array.from({ length: 6 }, () => provisionProfile(NEW_2)));

    const profiles = await prisma.profile.count({ where: { id: NEW_2 } });
    const roles = await prisma.userRole.count({ where: { profileId: NEW_2 } });
    const audits = await prisma.auditLog.count({
      where: { entityId: NEW_2, action: 'role.granted' },
    });
    expect(profiles).toBe(1);
    expect(roles).toBe(1);
    expect(audits).toBe(1);
  });
});

describe('role service', () => {
  it('a non-admin actor cannot grant roles (self-escalation blocked)', async () => {
    await expect(
      grantRole({
        actor: { userId: USER_A, email: null, roles: ['buyer'] },
        targetUserId: USER_A,
        role: 'admin',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('an admin can grant a role, and it is audited', async () => {
    const resulting = await grantRole({
      actor: { userId: ADMIN, email: null, roles: ['buyer', 'admin'] },
      targetUserId: USER_B,
      role: 'seller',
      correlationId: 'corr-1',
    });
    expect(resulting).toContain('seller');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'role.granted', entityId: USER_B },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.actorId).toBe(ADMIN);
  });

  it('refuses to remove the last admin', async () => {
    await expect(
      revokeRole({
        actor: { userId: ADMIN, email: null, roles: ['buyer', 'admin'] },
        targetUserId: ADMIN,
        role: 'admin',
      }),
    ).rejects.toMatchObject({ reason: 'cannot_remove_last_admin' });
  });

  it('allows removing an admin once another admin exists', async () => {
    // ADMIN stays the stable admin (used by later RLS reads). We promote USER_B
    // to a second admin, then demote USER_B — proving removal is allowed while
    // another admin remains, without disturbing ADMIN.
    const adminCtx: AuthContext = {
      userId: ADMIN,
      email: null,
      roles: ['buyer', 'admin'],
    };
    await grantRole({ actor: adminCtx, targetUserId: USER_B, role: 'admin' });
    const resulting = await revokeRole({
      actor: adminCtx,
      targetUserId: USER_B,
      role: 'admin',
    });
    expect(resulting).not.toContain('admin');
  });
});

describe('RLS — profiles', () => {
  it('a user can read only their own profile', async () => {
    const own = await runAs(USER_A, 'SELECT id FROM profiles WHERE id = $1', [
      USER_A,
    ]);
    expect(own.rows).toHaveLength(1);

    const other = await runAs(USER_A, 'SELECT id FROM profiles WHERE id = $1', [
      USER_B,
    ]);
    expect(other.rows).toHaveLength(0);

    const all = await runAs(USER_A, 'SELECT count(*)::int AS n FROM profiles');
    expect(all.rows[0].n).toBe(1);
  });

  it('an admin can read any profile', async () => {
    const res = await runAs(ADMIN, 'SELECT count(*)::int AS n FROM profiles');
    expect(res.rows[0].n).toBeGreaterThanOrEqual(3);
  });
});

describe('RLS — role self-escalation is impossible', () => {
  it('a user cannot INSERT a role for themselves', async () => {
    await expect(
      runAs(
        USER_A,
        `INSERT INTO user_roles (id, profile_id, role_id)
         SELECT gen_random_uuid(), $1, id FROM roles WHERE name = 'admin'`,
        [USER_A],
      ),
    ).rejects.toThrow();
  });

  it('a user can read their own roles but not others', async () => {
    const own = await runAs(
      USER_A,
      'SELECT count(*)::int AS n FROM user_roles WHERE profile_id = $1',
      [USER_A],
    );
    expect(own.rows[0].n).toBeGreaterThanOrEqual(1);

    const other = await runAs(
      USER_A,
      'SELECT count(*)::int AS n FROM user_roles WHERE profile_id = $1',
      [ADMIN],
    );
    expect(other.rows[0].n).toBe(0);
  });
});

describe('RLS — financial tables are not user-writable/readable', () => {
  it('a user cannot UPDATE subscription state', async () => {
    await expect(
      runAs(USER_A, "UPDATE subscriptions SET status = 'active'"),
    ).rejects.toThrow();
  });

  it('a user cannot UPDATE payment attempts', async () => {
    await expect(
      runAs(USER_A, "UPDATE payment_attempts SET status = 'succeeded'"),
    ).rejects.toThrow();
  });

  it('a user cannot INSERT payment events', async () => {
    await expect(
      runAs(
        USER_A,
        `INSERT INTO payment_events (id, payment_attempt_id, type, to_status)
         SELECT gen_random_uuid(), id, 'verified', 'succeeded' FROM payment_attempts LIMIT 1`,
      ),
    ).rejects.toThrow();
  });

  it('a seller can read their OWN payment attempts only', async () => {
    const own = await runAs(
      USER_A,
      'SELECT count(*)::int AS n FROM payment_attempts WHERE profile_id = $1',
      [USER_A],
    );
    expect(own.rows[0].n).toBe(1);

    const asC = await runAs(
      USER_C,
      'SELECT count(*)::int AS n FROM payment_attempts',
    );
    expect(asC.rows[0].n).toBe(0);
  });
});

describe('RLS — audit logs', () => {
  it('a normal user cannot read audit logs (0 rows)', async () => {
    const res = await runAs(
      USER_A,
      'SELECT count(*)::int AS n FROM audit_logs',
    );
    expect(res.rows[0].n).toBe(0);
  });

  it('an admin can read audit logs', async () => {
    const res = await runAs(ADMIN, 'SELECT count(*)::int AS n FROM audit_logs');
    expect(res.rows[0].n).toBeGreaterThan(0);
  });
});

describe('RLS — seller profiles', () => {
  it('owner reads own; non-owner sees none', async () => {
    const own = await runAs(
      USER_A,
      'SELECT count(*)::int AS n FROM seller_profiles',
    );
    expect(own.rows[0].n).toBe(1);
    const other = await runAs(
      USER_C,
      'SELECT count(*)::int AS n FROM seller_profiles',
    );
    expect(other.rows[0].n).toBe(0);
  });
});

describe('RLS — public catalogue', () => {
  it('anon can read active plans and categories', async () => {
    const plans = await runAs(
      'anon',
      'SELECT count(*)::int AS n FROM subscription_plans',
    );
    expect(plans.rows[0].n).toBe(3);
    const cats = await runAs(
      'anon',
      'SELECT count(*)::int AS n FROM categories',
    );
    expect(cats.rows[0].n).toBe(5);
  });

  it('anon cannot read profiles at all', async () => {
    await expect(
      runAs('anon', 'SELECT count(*) FROM profiles'),
    ).rejects.toThrow();
  });
});
