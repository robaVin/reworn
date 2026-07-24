/**
 * Shared helpers for the DEVELOPMENT provisioning scripts.
 *
 * These scripts are a development-stage convenience for granting seller/admin
 * access against a dev database. They are NOT part of the application, are not
 * reachable from the browser, and refuse to run in production.
 *
 * Security properties:
 *  - `assertNotProduction()` aborts if NODE_ENV=production.
 *  - Uses server-side privileged APIs only (Supabase service role + Prisma).
 *  - No passwords are committed: any password comes from a CLI flag or env var
 *    at runtime.
 *  - Emails are masked in logs.
 *
 * Long-term, seller onboarding becomes an in-app workflow; these scripts are the
 * interim path so we do not hand-run arbitrary SQL against the database.
 */
import { PrismaClient, type RoleName } from '@prisma/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run a dev provisioning script in production. These scripts ' +
        'are development-only. Seller onboarding in production is an in-app ' +
        'workflow, not a script.',
    );
  }
}

/** Reads a `--flag value` argument (or `--flag=value`) from argv. */
export function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith('--')) {
    return argv[i + 1];
  }
  return undefined;
}

export function requireEmail(): string {
  const email = (arg('email') ?? process.env.DEV_EMAIL ?? '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error(
      'Provide an email: `-- --email you@example.com` (or set DEV_EMAIL).',
    );
  }
  return email;
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

export function makePrisma(): PrismaClient {
  return new PrismaClient();
}

/** Privileged Supabase admin client (service role). Server-side only. */
export function makeSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the ' +
        'environment (.env).',
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Finds a Supabase Auth user by email (paginates the admin list). */
export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string } | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { id: match.id, email: match.email ?? email };
    if (data.users.length < 200) break; // last page
  }
  return null;
}

/** Idempotently ensures a profile + the default buyer role exist. */
export async function ensureProfileAndBuyer(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.profile.createMany({
    data: [{ id: userId }],
    skipDuplicates: true,
  });
  const buyer = await prisma.role.findUnique({ where: { name: 'buyer' } });
  if (!buyer) {
    throw new Error(
      'Database not seeded (buyer role missing). Run `npm run db:seed`.',
    );
  }
  await prisma.userRole.createMany({
    data: [{ profileId: userId, roleId: buyer.id }],
    skipDuplicates: true,
  });
}

/** Idempotently grants a role to a user. */
export async function grantRole(
  prisma: PrismaClient,
  userId: string,
  roleName: RoleName,
): Promise<void> {
  const role = await prisma.role.findUnique({ where: { name: roleName } });
  if (!role)
    throw new Error(`Role "${roleName}" not found. Run \`npm run db:seed\`.`);
  await prisma.userRole.createMany({
    data: [{ profileId: userId, roleId: role.id }],
    skipDuplicates: true,
  });
}

/** Idempotently ensures an active seller profile exists. */
export async function ensureSellerProfile(
  prisma: PrismaClient,
  userId: string,
  shopName: string,
): Promise<void> {
  await prisma.sellerProfile.upsert({
    where: { profileId: userId },
    update: {}, // never overwrite an existing seller profile
    create: { profileId: userId, shopName, status: 'active' },
  });
}
