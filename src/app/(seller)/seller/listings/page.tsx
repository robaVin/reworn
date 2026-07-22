import type { Metadata } from 'next';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Your listings' };
export const dynamic = 'force-dynamic';

/**
 * Seller listings — permanent route under the seller guard.
 * TRUTHFUL: listing management connects with the catalog increment.
 * No fabricated inventory or publish actions.
 */
export default async function SellerListingsPage() {
  await requireAnyRolePage(['seller', 'admin'], '/seller/listings');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Seller studio
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        Your listings
      </h1>
      <div className="mt-6 max-w-xl space-y-6">
        <Alert tone="info" title="Listing tools arrive with the catalogue">
          Creating, editing and publishing listings is part of the catalog
          increment. This page is the permanent destination for that work —
          nothing here is fabricated marketplace inventory.
        </Alert>
        <Button href="/seller" variant="outline">
          Back to seller dashboard
        </Button>
      </div>
    </main>
  );
}
