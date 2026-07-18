/**
 * Pure authorization decisions.
 *
 * No Next.js, no Supabase, no database — just the rules. This is deliberately
 * side-effect-free so every access rule is unit-testable in isolation, and so
 * there is exactly ONE place where "who may do what" is decided.
 *
 * CRITICAL INVARIANT: these functions only ever consider a SERVER-VERIFIED
 * identity (`AuthContext.userId`, which callers must populate from
 * supabase.auth.getUser()). There is no parameter through which a client can
 * supply its own user id, role, or ownership claim. Ownership checks compare
 * the verified id against an owner id that the caller loaded server-side.
 */
import type { Role } from './roles';
import { hasRole, hasAnyRole, isAdmin } from './roles';

/** A server-verified identity plus the roles loaded for it. */
export interface AuthContext {
  /** The verified Supabase Auth user id. Never client-supplied. */
  userId: string;
  email: string | null;
  roles: Role[];
}

export type AuthStatus = 401 | 403 | 404;

export type AuthOutcome =
  { ok: true } | { ok: false; status: AuthStatus; reason: string };

const ALLOW: AuthOutcome = { ok: true };
const deny = (status: AuthStatus, reason: string): AuthOutcome => ({
  ok: false,
  status,
  reason,
});

/** 401 if there is no authenticated user. */
export function checkAuthenticated(ctx: AuthContext | null): AuthOutcome {
  return ctx ? ALLOW : deny(401, 'unauthenticated');
}

/** Requires a specific role. 401 if anonymous, 403 if authenticated but lacking. */
export function checkRole(
  ctx: AuthContext | null,
  required: Role,
): AuthOutcome {
  if (!ctx) return deny(401, 'unauthenticated');
  return hasRole(ctx.roles, required)
    ? ALLOW
    : deny(403, `missing_role:${required}`);
}

/** Requires at least one of the listed roles. */
export function checkAnyRole(
  ctx: AuthContext | null,
  required: readonly Role[],
): AuthOutcome {
  if (!ctx) return deny(401, 'unauthenticated');
  return hasAnyRole(ctx.roles, required)
    ? ALLOW
    : deny(403, `missing_any_role:${required.join('|')}`);
}

export function checkAdmin(ctx: AuthContext | null): AuthOutcome {
  if (!ctx) return deny(401, 'unauthenticated');
  return isAdmin(ctx.roles) ? ALLOW : deny(403, 'missing_role:admin');
}

/**
 * Ownership check comparing the VERIFIED user id against a server-loaded owner
 * id. On mismatch it returns 404 by default — hiding the resource's existence
 * reduces IDOR information leakage — unless `hideAsNotFound: false` is set, in
 * which case it returns 403.
 *
 * @param ownerId  the true owner id, loaded server-side (never from the client)
 * @param opts.allowAdmin  admins may act on resources they do not own
 */
export function checkOwnership(
  ctx: AuthContext | null,
  ownerId: string,
  opts: { allowAdmin?: boolean; hideAsNotFound?: boolean } = {},
): AuthOutcome {
  const { allowAdmin = false, hideAsNotFound = true } = opts;
  if (!ctx) return deny(401, 'unauthenticated');
  if (ctx.userId === ownerId) return ALLOW;
  if (allowAdmin && isAdmin(ctx.roles)) return ALLOW;
  return hideAsNotFound ? deny(404, 'not_found') : deny(403, 'not_owner');
}
