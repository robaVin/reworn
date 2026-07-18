import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * PRIVILEGED server Supabase client (service role — BYPASSES RLS).
 *
 * ────────────────────────────  DANGER  ────────────────────────────
 * This client can read and write ANY row and ignores Row-Level Security.
 * It exists ONLY for a small set of explicitly-authorized, audited,
 * server-controlled operations:
 *   - verified payment processing
 *   - controlled role grants / revocations
 *   - administrative moderation
 *   - reconciliation / system jobs
 *
 * Rules (enforced by review + tooling):
 *   1. NEVER import from a Client Component (`server-only` makes it a build
 *      error; an ESLint rule also bans importing `@/lib/supabase/admin`).
 *   2. The service-role key is NEVER exposed to the browser (not NEXT_PUBLIC_*).
 *   3. This is NOT a general "db admin" convenience. Do not use it for ordinary
 *      profile reads or user-owned record access — use the user-scoped client so
 *      RLS applies. Every call site must be a deliberate privileged operation.
 *   4. Access is intentionally gated behind `getPrivilegedClient()` rather than a
 *      module-level export, to make each usage a conscious, greppable choice.
 * ──────────────────────────────────────────────────────────────────
 */

let cached: SupabaseClient | undefined;

/**
 * Returns the privileged client. Callers MUST have already performed explicit
 * authorization and should record an audit-log entry for the privileged action.
 */
export function getPrivilegedClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Privileged Supabase client is misconfigured: missing ' +
        'NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return cached;
}
