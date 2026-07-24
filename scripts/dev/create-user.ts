/**
 * DEV ONLY — create a Supabase Auth user (email-confirmed) and provision its
 * profile + default buyer role.
 *
 * Usage (password from a flag or env, NEVER committed):
 *   npm run dev:user:create -- --email you@example.com --password "Secret123"
 *   # or: set DEV_PASSWORD env var and omit --password
 *
 * Idempotent-ish: if the user already exists, it provisions the profile only.
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
} from './_shared';

async function main(): Promise<void> {
  assertNotProduction();
  const email = requireEmail();
  const password = arg('password') ?? process.env.DEV_PASSWORD ?? '';
  if (password.length < 8) {
    throw new Error(
      'Provide a password (>= 8 chars) via `--password` or DEV_PASSWORD. ' +
        'Passwords are never committed.',
    );
  }

  const supabase = makeSupabaseAdmin();
  const prisma = makePrisma();
  try {
    let user = await findAuthUserByEmail(supabase, email);
    if (!user) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(error?.message ?? 'createUser returned no user');
      }
      user = { id: data.user.id, email };
    }
    await ensureProfileAndBuyer(prisma, user.id);
    // eslint-disable-next-line no-console
    console.log(
      `[dev] User ready: ${maskEmail(email)} (user ${user.id}), buyer role provisioned.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[dev] create-user failed:', (error as Error).message);
  process.exitCode = 1;
});
