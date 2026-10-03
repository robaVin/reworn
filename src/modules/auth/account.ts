import 'server-only';

import { prisma } from '@/lib/db';

/** The account-page view of the signed-in user's own profile. */
export interface AccountProfile {
  displayName: string | null;
  createdAt: Date;
}

/**
 * Load the account-page fields for a verified user's OWN profile. Owner-scoped
 * by construction — the caller passes the server-verified `userId`.
 */
export async function getAccountProfile(
  userId: string,
): Promise<AccountProfile | null> {
  return prisma.profile.findUnique({
    where: { id: userId },
    select: { displayName: true, createdAt: true },
  });
}
