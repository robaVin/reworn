import { getTranslations, getLocale } from 'next-intl/server';
import { requireUserPage } from '@/modules/auth/page-guards';
import { getAccountProfile } from '@/modules/auth/account';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { DisplayNameForm } from '@/components/account/DisplayNameForm';

export const dynamic = 'force-dynamic';

/**
 * Account — shows only data available from the real auth context + profile
 * today, and the one setting that is actually wired (display name). Future
 * privacy / notification / data-export settings are labeled as deferred; none
 * of them are simulated.
 */
export default async function AccountPage() {
  const ctx = await requireUserPage('/account');
  const [t, locale, profile] = await Promise.all([
    getTranslations('Account'),
    getLocale(),
    getAccountProfile(ctx.userId),
  ]);
  const roles = ctx.roles.length > 0 ? ctx.roles.join(', ') : 'buyer';
  const memberSince = profile?.createdAt
    ? new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
      }).format(profile.createdAt)
    : null;

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('title')}
      </h1>
      <p className="mt-2 text-sm text-muted">{t('signedInWithSession')}</p>

      <div className="mt-8 grid max-w-2xl gap-4">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            {t('profile')}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted">
                {t('emailLabel')}
              </dt>
              <dd className="mt-1 text-ink">{ctx.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted">
                {t('rolesLabel')}
              </dt>
              <dd className="mt-1 text-ink">{roles}</dd>
            </div>
            {memberSince && (
              <div>
                <dt className="text-xs uppercase tracking-[0.08em] text-muted">
                  {t('memberSince')}
                </dt>
                <dd className="mt-1 text-ink">{memberSince}</dd>
              </div>
            )}
          </dl>

          <div className="mt-5 border-t border-line pt-5">
            <DisplayNameForm initial={profile?.displayName ?? ''} />
          </div>
        </Card>

        <Alert tone="info" title={t('moreSettingsTitle')}>
          {t('moreSettingsBody')}
        </Alert>

        <LogoutButton />
      </div>
    </main>
  );
}
