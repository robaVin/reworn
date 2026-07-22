import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

/**
 * Seller dashboard — permanent Sustainable shell under the real seller guard.
 *
 * TRUTHFUL (Slice A / ahead of Increment #6): no fabricated views, inquiries,
 * quota meters or subscription status. Cards describe what will connect when
 * the subscription and catalog domains land.
 */
export default async function SellerHomePage() {
  await requireAnyRolePage(['seller', 'admin'], '/seller');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Seller studio
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[40px]">
        Your seller space
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        Access granted. Operational metrics and publishing tools connect as
        their domains ship — nothing here is simulated marketplace data.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            Subscription
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Plan selection, weekly listing quota and renewals open with
            Increment #6.
          </p>
          <div className="mt-4">
            <Button href="/seller/subscription" variant="outline" size="sm">
              Open subscription
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            Listings
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Create, preview and publish listings once the catalogue domain is
            connected. No listings yet.
          </p>
          <div className="mt-4">
            <Button href="/seller/listings" variant="outline" size="sm">
              Open listings
            </Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">
            Inquiries
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Buyer messages about your pieces arrive with the messaging
            increment.
          </p>
          <div className="mt-4">
            <Button href="/messages" variant="outline" size="sm">
              Open messages
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-8 max-w-xl">
        <Alert tone="info" title="No fabricated metrics">
          Active listings, views, saved-by-buyers counts and quota usage will
          appear here from real services — never from design fixtures.
        </Alert>
      </div>
    </main>
  );
}
