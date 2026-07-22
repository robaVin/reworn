import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { Alert } from '@/components/ui/Alert';

/**
 * Google OAuth entry — configuration-dependent.
 *
 * When Supabase public credentials are absent, shows a truthful unavailable
 * state. When present, links to the server OAuth start route (no client secrets).
 * Successful OAuth is never simulated.
 */
export function OAuthButtons({
  next,
  mode = 'login',
}: {
  next?: string;
  mode?: 'login' | 'register';
}) {
  if (!isSupabaseConfigured()) {
    return (
      <Alert tone="warning" title="Google sign-in is unavailable here">
        Authentication is not configured in this environment, so Google sign-
        {mode === 'register' ? 'up' : 'in'} cannot start. Connect a Supabase
        project (see <code>.env.example</code>) to enable it.
      </Alert>
    );
  }

  const href = next
    ? `/api/auth/oauth/google?next=${encodeURIComponent(next)}`
    : '/api/auth/oauth/google';

  return (
    <div className="space-y-3">
      <div className="relative flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs uppercase tracking-[0.12em] text-muted">
          Or
        </span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <Button href={href} variant="outline" className="w-full">
        Continue with Google
      </Button>
      <p className="text-xs text-muted">
        Google must be enabled in your Supabase Auth providers. If the provider
        is not configured, you will see a safe error — never a fake success.
      </p>
      <p className="sr-only">
        Alternative: use email and password on this page, or{' '}
        <Link href="/register">create an account</Link>.
      </p>
    </div>
  );
}
