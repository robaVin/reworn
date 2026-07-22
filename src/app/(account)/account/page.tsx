import { requireUserPage } from '@/modules/auth/page-guards';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { LogoutButton } from '@/components/auth/LogoutButton';

export const dynamic = 'force-dynamic';

/**
 * Account — shows only data available from the real auth context today.
 * Future privacy / notification settings are labeled as deferred.
 */
export default async function AccountPage() {
  const ctx = await requireUserPage('/account');
  const roles = ctx.roles.length > 0 ? ctx.roles.join(', ') : 'buyer';

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Your account
      </h1>
      <p className="mt-2 text-sm text-muted">
        Signed in with your real ReWorn session.
      </p>

      <div className="mt-8 grid max-w-2xl gap-4">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            Profile
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted">
                Email
              </dt>
              <dd className="mt-1 text-ink">{ctx.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.08em] text-muted">
                Roles
              </dt>
              <dd className="mt-1 text-ink">{roles}</dd>
            </div>
          </dl>
        </Card>

        <Alert tone="info" title="More account settings arrive later">
          Display-name editing, notification preferences, privacy controls and
          data-export requests will appear here when those services connect.
          Nothing below is simulated.
        </Alert>

        <LogoutButton />
      </div>
    </main>
  );
}
