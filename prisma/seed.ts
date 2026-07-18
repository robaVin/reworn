/**
 * Development seed — IDEMPOTENT and PRODUCTION-SAFE.
 *
 * - Idempotent: every write is an upsert keyed on a stable natural key, so
 *   running it repeatedly converges to the same state and never duplicates.
 * - Production-safe: `assertSeedAllowed` refuses to run against production or a
 *   hosted Supabase database unless a deliberate override is set.
 *
 * Seeds ONLY the Stage 1 foundation data:
 *   - the three system roles
 *   - PROVISIONAL subscription plans (names/prices are placeholders, NOT
 *     approved business pricing — configurable and clearly marked)
 *   - a small category tree (to validate the catalogue pipeline)
 *
 * It deliberately creates NO users, sellers, subscriptions or payments —
 * those are exercised by tests and real flows, not by the seed.
 */
import { PrismaClient, RoleName } from '@prisma/client';
import { assertSeedAllowed } from './seed-guard';

const prisma = new PrismaClient();

/**
 * PROVISIONAL plans — placeholders for development only.
 * Prices are in MINOR UNITS of MKD (e.g. 30000 = 300.00 ден). Weekly quotas
 * (7 / 15 / 30) are the approved development values; names and prices are NOT
 * approved business pricing and are expected to change.
 */
const PROVISIONAL_PLANS = [
  {
    code: 'starter',
    name: '[PROVISIONAL] Starter',
    priceMinor: 30000, // 300.00 MKD — placeholder
    currency: 'MKD',
    termDays: 30,
    weeklyListingQuota: 7,
  },
  {
    code: 'standard',
    name: '[PROVISIONAL] Standard',
    priceMinor: 50000, // 500.00 MKD — placeholder
    currency: 'MKD',
    termDays: 30,
    weeklyListingQuota: 15,
  },
  {
    code: 'pro',
    name: '[PROVISIONAL] Pro',
    priceMinor: 80000, // 800.00 MKD — placeholder
    currency: 'MKD',
    termDays: 30,
    weeklyListingQuota: 30,
  },
] as const;

const CATEGORIES = [
  { slug: 'clothing', name: 'Clothing', sortOrder: 1 },
  { slug: 'shoes', name: 'Shoes', sortOrder: 2 },
  { slug: 'bags', name: 'Bags', sortOrder: 3 },
  { slug: 'accessories', name: 'Accessories', sortOrder: 4 },
  { slug: 'jewelry', name: 'Jewelry', sortOrder: 5 },
] as const;

async function main(): Promise<void> {
  assertSeedAllowed(process.env);

  // Roles — stable natural key is the enum name.
  for (const name of Object.values(RoleName)) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} role` },
    });
  }

  // Provisional plans — keyed on `code`.
  for (const plan of PROVISIONAL_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceMinor: plan.priceMinor,
        currency: plan.currency,
        termDays: plan.termDays,
        weeklyListingQuota: plan.weeklyListingQuota,
      },
      create: { ...plan },
    });
  }

  // Categories — keyed on `slug`.
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: category.sortOrder },
      create: { ...category },
    });
  }

  const [roles, plans, categories] = await Promise.all([
    prisma.role.count(),
    prisma.subscriptionPlan.count(),
    prisma.category.count(),
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `Seed complete: ${roles} roles, ${plans} provisional plans, ${categories} categories.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
