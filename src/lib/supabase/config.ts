/**
 * Whether the Supabase public configuration is present and usable.
 *
 * Used by UI that must stay truthful when credentials are not yet
 * configured (e.g. the header renders the logged-out state — with no auth
 * backend there CAN be no session). This is a configuration check only; it
 * never substitutes for authentication and grants nothing.
 *
 * Placeholder values from `.env.example` (YOUR-PROJECT-REF / REPLACE_WITH_…)
 * are treated as NOT configured so a half-filled local env cannot pretend
 * authentication is available.
 */
function looksLikePlaceholder(value: string): boolean {
  const v = value.trim().toUpperCase();
  return (
    v.length === 0 ||
    v.includes('YOUR-PROJECT-REF') ||
    v.includes('REPLACE_WITH') ||
    v.includes('EXAMPLE.COM') ||
    v === 'CHANGE_ME'
  );
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  if (!url || !anon) return false;
  if (looksLikePlaceholder(url) || looksLikePlaceholder(anon)) return false;
  try {
    // Must be an absolute http(s) URL; rejects relative junk.
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
