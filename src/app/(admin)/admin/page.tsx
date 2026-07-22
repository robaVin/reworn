import { requireAdminPage } from '@/modules/auth/page-guards';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

/**
 * Admin home — real admin guard only. No fake moderation queues, payment
 * records or destructive controls. Future sections are labeled as later.
 */
export default async function AdminHomePage() {
  await requireAdminPage('/admin');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Admin &amp; support
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        Operations
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        Admin access confirmed by the server-side role guard. Management tools
        arrive in later increments.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          'Users',
          'Sellers',
          'Subscriptions',
          'Payment attempts',
          'Audit logs',
          'Moderation',
        ].map((section) => (
          <Card key={section}>
            <h2 className="font-display text-lg font-semibold text-ink">
              {section}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Coming in a later increment. Read-only views will load from real
              tables — no placeholder actions here.
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-8 max-w-xl">
        <Alert tone="info" title="No non-functional controls">
          Destructive or mutating admin actions are intentionally absent until
          their services exist behind this shell.
        </Alert>
      </div>
    </main>
  );
}
