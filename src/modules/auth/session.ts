import 'server-only';

import { cache } from 'react';
import {
  createSupabaseUserClient,
  type UserSupabaseClient,
} from '@/lib/supabase/server';
import { timeSpan } from '@/lib/perf';
import { normalizeRoles, type Role } from './roles';
import type { AuthContext } from './authorization';

/**
 * Server-verified session + role loading.
 *
 * IDENTITY RULE: the user id ALWAYS comes from `supabase.auth.getUser()`, which
 * validates the JWT with the Supabase Auth server — not from a decoded cookie,
 * request body, query string, or header. Callers must never pass a client id in.
 *
 * Roles are loaded via the USER-SCOPED client, so the read itself is subject to
 * RLS ("a user may read their own roles"). We do not reach for the privileged,
 * RLS-bypassing client just to read a user's own roles.
 */

interface VerifiedUser {
  id: string;
  email: string | null;
}

/** Returns the server-verified user, or null if there is no valid session. */
export async function getVerifiedUser(
  client?: UserSupabaseClient,
): Promise<VerifiedUser | null> {
  const supabase = client ?? (await createSupabaseUserClient());
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Loads the effective roles for a verified user via the user-scoped (RLS) client. */
export async function loadRoles(
  supabase: UserSupabaseClient,
  userId: string,
): Promise<Role[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('roles(name)')
    .eq('profile_id', userId);

  if (error || !data) return [];

  const names = (data as Array<{ roles: unknown }>)
    .map((row) => {
      const rel = (row as { roles: unknown }).roles;
      // The relation may deserialize as an object or a single-element array.
      if (Array.isArray(rel)) {
        return (rel[0] as { name?: unknown } | undefined)?.name;
      }
      return (rel as { name?: unknown } | null)?.name;
    })
    .filter((n): n is string => typeof n === 'string');

  return normalizeRoles(names);
}

/**
 * Builds the full auth context (verified user + roles) for the current request,
 * or null if unauthenticated. This is the single entry point guards use.
 *
 * Wrapped in React `cache()` for REQUEST-SCOPED memoization: within one render
 * (SiteHeader + a layout guard + a page guard all call this), the Supabase
 * `getUser()` round-trip and the roles query run exactly ONCE instead of 3–4×.
 * The cache lives for a single request only — it never persists an auth/z
 * decision across requests, so this does not weaken authorization.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  return timeSpan('auth.getAuthContext', async () => {
    const supabase = await createSupabaseUserClient();
    const user = await timeSpan('auth.getUser', () =>
      getVerifiedUser(supabase),
    );
    if (!user) return null;

    const roles = await timeSpan('auth.roles', () =>
      loadRoles(supabase, user.id),
    );
    return { userId: user.id, email: user.email, roles };
  });
});
