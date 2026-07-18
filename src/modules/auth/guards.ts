import 'server-only';

import type { Role } from './roles';
import {
  checkAdmin,
  checkAnyRole,
  checkAuthenticated,
  checkOwnership,
  checkRole,
  type AuthContext,
  type AuthOutcome,
} from './authorization';
import { getAuthContext } from './session';
import { AuthorizationError } from './errors';

// Re-export so existing importers (`http.ts`, `page-guards.ts`) are unaffected.
export { AuthorizationError };

/**
 * Server-side authorization guards — the ONLY sanctioned way a protected server
 * operation establishes the caller's rights.
 *
 * Each guard loads the server-verified context, applies a pure decision from
 * authorization.ts, and throws `AuthorizationError` on denial. Route handlers
 * map that to a response; page/layout guards convert it to a redirect / notFound
 * (see http.ts / page-guards). Guards NEVER trust client-supplied identity.
 */

function enforce(ctx: AuthContext | null, outcome: AuthOutcome): AuthContext {
  if (!outcome.ok) throw new AuthorizationError(outcome.status, outcome.reason);
  // ctx is non-null whenever an outcome is ok (checks return 401 otherwise).
  return ctx as AuthContext;
}

/** Requires any authenticated user. Throws 401 otherwise. Returns the context. */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  return enforce(ctx, checkAuthenticated(ctx));
}

/** Requires a specific role. Throws 401/403. */
export async function requireRole(role: Role): Promise<AuthContext> {
  const ctx = await getAuthContext();
  return enforce(ctx, checkRole(ctx, role));
}

/** Requires at least one of the given roles. */
export async function requireAnyRole(
  roles: readonly Role[],
): Promise<AuthContext> {
  const ctx = await getAuthContext();
  return enforce(ctx, checkAnyRole(ctx, roles));
}

/** Requires the admin role. */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  return enforce(ctx, checkAdmin(ctx));
}

/**
 * Requires the verified user to own the resource (owner id loaded server-side).
 * Defaults to a 404 on mismatch to avoid leaking existence (IDOR).
 */
export async function requireOwnership(
  ownerId: string,
  opts?: { allowAdmin?: boolean; hideAsNotFound?: boolean },
): Promise<AuthContext> {
  const ctx = await getAuthContext();
  return enforce(ctx, checkOwnership(ctx, ownerId, opts));
}
