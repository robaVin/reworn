import type { Metadata } from 'next';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Subscription' };
export const dynamic = 'force-dynamic';

/**
 * Seller subscription — permanent route under the seller guard.
 * TRUTHFUL: the subscription domain opens with Increment #6.
 * No fabricated plan status, quota meters or payment history.
 */
export default async function SellerSubscriptionPage() {
  await requireAnyRolePage(['seller', 'admin'], '/seller/subscription');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Seller studio
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        Subscription
      </h1>
      <div className="mt-6 max-w-xl space-y-6">
        <Alert tone="info" title="Subscription domain not yet connected">
          Plan selection, weekly listing quotas and renewal management open with
          Increment #6. This page is the permanent destination — status, quota
          and payment history will appear here from the real subscription
          service, never from fixtures.
        </Alert>
        <Button href="/seller" variant="outline">
          Back to seller dashboard
        </Button>
      </div>
    </main>
  );
}
