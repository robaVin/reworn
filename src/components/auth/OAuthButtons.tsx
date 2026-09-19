import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('Auth');
  if (!isSupabaseConfigured()) {
    return (
      <Alert tone="warning" title={t('googleUnavailableTitle')}>
        {t.rich('oauthUnavailableBody', {
          action: mode === 'register' ? t('googleSignUp') : t('googleSignIn'),
          code: (chunks) => <code>{chunks}</code>,
        })}
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
          {t('orDivider')}
        </span>
        <div className="h-px flex-1 bg-line" />
      </div>
      <Button href={href} variant="outline" className="w-full">
        {t('continueWithGoogle')}
      </Button>
      <p className="text-xs text-muted">{t('oauthProviderNote')}</p>
      <p className="sr-only">
        {t.rich('oauthSrAlternative', {
          link: (chunks) => <Link href="/register">{chunks}</Link>,
        })}
      </p>
    </div>
  );
}
