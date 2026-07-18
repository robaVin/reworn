/**
 * Role definitions and pure role logic.
 *
 * This module is intentionally dependency-free (no DB, no Supabase, no
 * `server-only`) so the rules are unit-testable in isolation and importable
 * from anywhere. It contains NO authorization side effects — it only answers
 * "does this set of roles satisfy this requirement?".
 *
 * SECURITY: nothing here trusts client input. Callers must pass roles that were
 * loaded server-side for a server-verified user (see requireUser/loadRoles).
 */

/** The three application roles. Mirrors the Prisma `RoleName` enum. */
export const ROLES = ['buyer', 'seller', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' && (ROLES as readonly string[]).includes(value)
  );
}

/** Normalises an arbitrary list into a de-duplicated set of valid roles. */
export function normalizeRoles(values: readonly unknown[]): Role[] {
  const set = new Set<Role>();
  for (const v of values) if (isRole(v)) set.add(v);
  return [...set];
}

export function hasRole(roles: readonly Role[], required: Role): boolean {
  return roles.includes(required);
}

export function hasAnyRole(
  roles: readonly Role[],
  required: readonly Role[],
): boolean {
  return required.some((r) => roles.includes(r));
}

export function isAdmin(roles: readonly Role[]): boolean {
  return roles.includes('admin');
}

/**
 * Whether `roles` is allowed to act as a seller.
 * Admins are intentionally allowed on seller routes (operational override),
 * matching the route-protection rule "seller routes require seller OR admin".
 */
export function canActAsSeller(roles: readonly Role[]): boolean {
  return roles.includes('seller') || roles.includes('admin');
}
