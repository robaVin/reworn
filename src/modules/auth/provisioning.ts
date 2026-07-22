import 'server-only';

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Application-profile provisioning.
 *
 * Runs on the PRIVILEGED path (Prisma / service connection) because it writes
 * `user_roles`, which ordinary users may never write. It is:
 *
 *  - Idempotent: uses INSERT … ON CONFLICT DO NOTHING (`createMany` +
 *    `skipDuplicates`) on the profile PK and the (profile_id, role_id) unique
 *    key, so repeated calls converge to one profile and one buyer role.
 *  - Concurrency-safe: two simultaneous first requests both run ON CONFLICT DO
 *    NOTHING; the database unique constraints guarantee exactly one profile and
 *    exactly one buyer-role assignment survive. Only the request that actually
 *    inserted the role writes the "granted" audit entry (count > 0).
 *  - Atomic & recoverable: profile + role are created in one transaction, so a
 *    partial failure rolls back and a retry re-converges.
 *  - Identity-safe: the profile id is ALWAYS the verified Supabase Auth uuid.
 *    We never overwrite an existing profile (DO NOTHING), so a profile can never
 *    be hijacked onto another identity.
 *
 * The DEFAULT ROLE IS ALWAYS `buyer`. Role data supplied by the client during
 * registration is ignored entirely.
 *
 * `displayName` is applied ONLY when this call creates the profile row. An
 * existing profile is never overwritten by provisioning input.
 */

export interface ProvisionOptions {
  displayName?: string | null;
}

export interface ProvisionResult {
  profileCreated: boolean;
  buyerRoleAssigned: boolean;
}

export async function provisionProfile(
  verifiedUserId: string,
  options: ProvisionOptions = {},
): Promise<ProvisionResult> {
  const displayName =
    typeof options.displayName === 'string' && options.displayName.trim()
      ? options.displayName.trim().slice(0, 80)
      : null;

  return prisma.$transaction(async (tx) => {
    // 1. Profile — id is the verified auth uuid; never overwrite an existing row.
    const profileInsert = await tx.profile.createMany({
      data: [{ id: verifiedUserId, displayName }],
      skipDuplicates: true,
    });
    const profileCreated = profileInsert.count > 0;

    // 2. Default buyer role — exactly once, ignoring any client-provided role.
    const buyerRole = await tx.role.findUnique({ where: { name: 'buyer' } });
    if (!buyerRole) {
      // Roles are seeded; their absence is an operational error, not user input.
      throw new Error(
        'provisioning_failed: buyer role missing (database not seeded).',
      );
    }

    const roleInsert = await tx.userRole.createMany({
      data: [{ profileId: verifiedUserId, roleId: buyerRole.id }],
      skipDuplicates: true,
    });
    const buyerRoleAssigned = roleInsert.count > 0;

    // 3. Audit the default grant ONLY when this request actually assigned it,
    //    so concurrent/duplicate provisioning produces a single audit entry.
    if (buyerRoleAssigned) {
      await tx.auditLog.create({
        data: {
          actorId: null, // system provisioning, not an admin action
          action: 'role.granted',
          entityType: 'user_role',
          entityId: verifiedUserId,
          metadata: {
            grantedRole: 'buyer',
            previousRoles: [],
            resultingRoles: ['buyer'],
            source: 'provisioning',
          },
        },
      });
    }

    logger.info('profile provisioned', {
      userId: verifiedUserId,
      profileCreated,
      buyerRoleAssigned,
    });

    return { profileCreated, buyerRoleAssigned };
  });
}
