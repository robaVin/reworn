/**
 * DEV ONLY — grant an existing account the seller role + an active seller
 * profile so it can create listings during development.
 *
 * Usage:
 *   npm run dev:seller:provision -- --email you@example.com [--shop "My Shop"]
 *
 * The account must already exist in Supabase Auth (register/log in once first,
 * which also provisions the profile). Idempotent: safe to run repeatedly.
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
  ensureSellerProfile,
} from './_shared';

async function main(): Promise<void> {
  assertNotProduction();
  const email = requireEmail();
  const shopName = arg('shop') ?? 'Dev Test Shop';

  const supabase = makeSupabaseAdmin();
  const prisma = makePrisma();
  try {
    const user = await findAuthUserByEmail(supabase, email);
    if (!user) {
      throw new Error(
        `No Supabase Auth user for ${maskEmail(email)}. Register/log in once ` +
          `first, then re-run this.`,
      );
    }

    await ensureProfileAndBuyer(prisma, user.id);
    await grantRole(prisma, user.id, 'seller');
    await ensureSellerProfile(prisma, user.id, shopName);

    // eslint-disable-next-line no-console
    console.log(
      `[dev] Provisioned seller for ${maskEmail(email)} (user ${user.id}): ` +
        `roles include seller, active seller profile "${shopName}".`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[dev] provision-seller failed:', (error as Error).message);
  process.exitCode = 1;
});
