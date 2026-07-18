import 'server-only';

import { redirect, notFound } from 'next/navigation';
import type { Role } from './roles';
import type { AuthContext } from './authorization';
import {
  AuthorizationError,
  requireAdmin,
  requireAnyRole,
  requireRole,
  requireUser,
} from './guards';

/**
 * Page/layout guards for Server Components.
 *
 * They reuse the same throwing guards as route handlers, then translate the
 * failure into navigation:
 *   - 401 (unauthenticated) → redirect to /login, preserving the intended path
 *     so the user returns after signing in. /login is public, so there is no
 *     redirect loop when a session expires.
 *   - 403 / 404 → notFound(), which hides the very existence of the area
 *     (e.g. a non-admin cannot even tell /admin exists).
 */
async function runGuard(
  guard: () => Promise<AuthContext>,
  nextPath?: string,
): Promise<AuthContext> {
  try {
    return await guard();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.status === 401) {
        const suffix = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
        redirect(`/login${suffix}`);
      }
      notFound();
    }
    throw error;
  }
}

export function requireUserPage(nextPath?: string): Promise<AuthContext> {
  return runGuard(() => requireUser(), nextPath);
}

export function requireRolePage(
  role: Role,
  nextPath?: string,
): Promise<AuthContext> {
  return runGuard(() => requireRole(role), nextPath);
}

export function requireAnyRolePage(
  roles: readonly Role[],
  nextPath?: string,
): Promise<AuthContext> {
  return runGuard(() => requireAnyRole(roles), nextPath);
}

export function requireAdminPage(nextPath?: string): Promise<AuthContext> {
  return runGuard(() => requireAdmin(), nextPath);
}
