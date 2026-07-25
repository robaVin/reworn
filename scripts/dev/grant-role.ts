/**
 * DEV ONLY — grant a role to an existing account.
 *
 * Usage:
 *   npm run dev:role:grant -- --email you@example.com --role admin
 *   npm run dev:role:grant -- --email you@example.com --role seller
 *
 * Idempotent. The account must already exist in Supabase Auth.
 */
import {
  assertNotProduction,
  arg,
  requireEmail,
  maskEmail,
  makePrisma,
  makeSupabaseAdmin,
  findAuthUserByEmail,
  ensureProfileAndBuyer,
  grantRole,
} from './_shared';
import type { RoleName } from '@prisma/client';

const VALID_ROLES: RoleName[] = ['buyer', 'seller', 'admin'];

async function main(): Promise<void> {
  assertNotProduction();
  const email = requireEmail();
  const role = (arg('role') ?? '').trim() as RoleName;
  if (!VALID_ROLES.includes(role)) {
    throw new Error('Provide a valid role: `--role buyer|seller|admin`.');
  }

  const supabase = makeSupabaseAdmin();
  const prisma = makePrisma();
  try {
    const user = await findAuthUserByEmail(supabase, email);
    if (!user) {
      throw new Error(
        `No Supabase Auth user for ${maskEmail(email)}. Register/log in first.`,
      );
    }
    await ensureProfileAndBuyer(prisma, user.id);
    await grantRole(prisma, user.id, role);
    console.log(
      `[dev] Granted role "${role}" to ${maskEmail(email)} (user ${user.id}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[dev] grant-role failed:', (error as Error).message);
  process.exitCode = 1;
});
