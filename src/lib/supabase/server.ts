import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/**
 * USER-SCOPED server Supabase client.
 *
 * This is the DEFAULT client for user-facing server work. It reads the
 * authenticated session from the request cookies and sends the user's JWT with
 * every query, so **Postgres RLS applies** and the database enforces per-user
 * access as a second layer beneath the application checks.
 *
 * Prefer this over the privileged client for anything a user is allowed to do
 * to their own data. Using the privileged (RLS-bypassing) client for ordinary
 * reads would silently disable the database's access control.
 *
 * `server-only` makes importing this from a Client Component a build error, and
 * the anon key (not the service-role key) is used here.
 */
/** The concrete type of our user-scoped server client (inferred from the SSR helper). */
export type UserSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseUserClient>
>;

export async function createSupabaseUserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase user client is misconfigured: missing NEXT_PUBLIC_SUPABASE_URL ' +
        'or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In a Server Component render, cookies() is read-only and throws on
        // write; the session-refresh path in middleware performs the actual
        // rotation. Swallowing here keeps read paths working.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* called from a Server Component render — safe to ignore */
        }
      },
    },
  });
}
