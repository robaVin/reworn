import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { AuthorizationError } from './errors';
import { normalizeRoles, type Role } from './roles';
import type { AuthContext } from './authorization';

/**
 * Controlled role grant / revoke — the ONLY sanctioned way roles change.
 *
 * Security properties:
 *  - PRIVILEGED PATH ONLY. Roles are never mutated through profile updates or
 *    the user-scoped client (RLS forbids user writes to user_roles). This
 *    service uses the privileged Prisma connection.
 *  - AUTHORIZED: every mutation requires the ACTOR to be an admin (checked
 *    against the actor's server-verified roles). A non-admin — including someone
 *    trying to escalate themselves — cannot grant or revoke anything.
 *  - SELF-ESCALATION BLOCKED: because only admins may call this, a user cannot
 *    grant themselves seller or admin. (Registration grants buyer only, via
 *    provisioning, never via this service.)
 *  - LAST-ADMIN PROTECTION: revoking `admin` is refused if it would remove the
 *    final remaining admin, unless explicitly overridden.
 *  - FULLY AUDITED: every grant/revoke writes an immutable audit entry with
 *    actor, target, previous roles, resulting roles, action and correlation id.
 */

interface RoleMutationInput {
  actor: AuthContext;
  targetUserId: string;
  role: Role;
  correlationId?: string;
}

function assertActorIsAdmin(actor: AuthContext): void {
  if (!actor.roles.includes('admin')) {
    throw new AuthorizationError(403, 'role_mutation_requires_admin');
  }
}

async function currentRoles(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<Role[]> {
  const rows = await tx.userRole.findMany({
    where: { profileId: userId },
    select: { role: { select: { name: true } } },
  });
  return normalizeRoles(rows.map((r) => r.role.name));
}

export async function grantRole(input: RoleMutationInput): Promise<Role[]> {
  const { actor, targetUserId, role, correlationId } = input;
  assertActorIsAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const previousRoles = await currentRoles(tx, targetUserId);

    const roleRow = await tx.role.findUnique({ where: { name: role } });
    if (!roleRow) throw new Error(`role_missing:${role}`);

    // Target must have a profile — never fabricate identity here.
    const profile = await tx.profile.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!profile) throw new AuthorizationError(404, 'target_profile_not_found');

    await tx.userRole.createMany({
      data: [
        {
          profileId: targetUserId,
          roleId: roleRow.id,
          grantedBy: actor.userId,
        },
      ],
      skipDuplicates: true,
    });

    const resultingRoles = await currentRoles(tx, targetUserId);

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: 'role.granted',
        entityType: 'user_role',
        entityId: targetUserId,
        metadata: {
          grantedRole: role,
          previousRoles,
          resultingRoles,
          correlationId: correlationId ?? null,
        },
      },
    });

    logger.info('role granted', {
      actorId: actor.userId,
      targetUserId,
      role,
      correlationId,
    });

    return resultingRoles;
  });
}

export async function revokeRole(
  input: RoleMutationInput & { allowRemoveLastAdmin?: boolean },
): Promise<Role[]> {
  const { actor, targetUserId, role, correlationId, allowRemoveLastAdmin } =
    input;
  assertActorIsAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const previousRoles = await currentRoles(tx, targetUserId);

    // Last-admin protection: never strip the final admin by accident.
    if (role === 'admin' && !allowRemoveLastAdmin) {
      const adminCount = await tx.userRole.count({
        where: { role: { name: 'admin' } },
      });
      const targetIsAdmin = previousRoles.includes('admin');
      if (targetIsAdmin && adminCount <= 1) {
        throw new AuthorizationError(403, 'cannot_remove_last_admin');
      }
    }

    const roleRow = await tx.role.findUnique({ where: { name: role } });
    if (!roleRow) throw new Error(`role_missing:${role}`);

    await tx.userRole.deleteMany({
      where: { profileId: targetUserId, roleId: roleRow.id },
    });

    const resultingRoles = await currentRoles(tx, targetUserId);

    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: 'role.revoked',
        entityType: 'user_role',
        entityId: targetUserId,
        metadata: {
          revokedRole: role,
          previousRoles,
          resultingRoles,
          correlationId: correlationId ?? null,
        },
      },
    });

    logger.info('role revoked', {
      actorId: actor.userId,
      targetUserId,
      role,
      correlationId,
    });

    return resultingRoles;
  });
}
