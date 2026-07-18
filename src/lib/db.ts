import 'server-only';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma client singleton — SERVER ONLY.
 *
 * This client connects with `DATABASE_URL`, which on Supabase is a
 * privileged, RLS-bypassing connection. It must NEVER be imported from a
 * Client Component. Two guards enforce that:
 *   1. `import 'server-only'` — makes a client-side import a build error.
 *   2. An ESLint `no-restricted-imports` rule on `@/lib/db`.
 *
 * Because the server holds the authorization authority (see the security
 * architecture), all privileged reads/writes go through here, and Postgres
 * RLS remains the deny-by-default backstop for any other connection path.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Avoid exhausting connections during Next.js hot-reload in development.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
