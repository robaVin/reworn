import type { Metadata } from 'next';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import {
  resolveSellerForUser,
  listActiveCategories,
} from '@/modules/catalog/listing-service';
import { CreateListingForm } from '@/components/seller/CreateListingForm';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'New listing' };
export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  // Server-side role enforcement (seller or admin). Buyers get notFound().
  const ctx = await requireAnyRolePage(
    ['seller', 'admin'],
    '/seller/listings/new',
  );

  const seller = await resolveSellerForUser(ctx.userId);
  const categories =
    seller && seller.status === 'active' ? await listActiveCategories() : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Seller studio
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        Create a listing
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        Save a draft any time; publish when it&apos;s ready. Buyers contact you
        directly — ReWorn doesn&apos;t process the sale.
      </p>

      <div className="mt-8">
        {!seller ? (
          <SellerProfileRequired />
        ) : seller.status !== 'active' ? (
          <SellerNotActive status={seller.status} />
        ) : (
          <>
            <TemporaryEntitlementNotice />
            <div className="mt-6">
              <CreateListingForm categories={categories} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function SellerProfileRequired() {
  return (
    <Alert tone="info" title="Seller profile required">
      Your account has the seller role but no seller profile yet. In-app seller
      onboarding arrives in a later increment. For development, an operator can
      provision one:
      <code className="mt-2 block rounded-lg bg-sand px-3 py-2 text-xs text-ink">
        npm run dev:seller:provision -- --email you@example.com
      </code>
    </Alert>
  );
}

function SellerNotActive({ status }: { status: string }) {
  return (
    <Alert tone="warning" title="Seller account not active">
      Your seller account is currently <strong>{status}</strong>, so you
      can&apos;t create or publish listings. Please contact support.
      <div className="mt-3">
        <Button href="/seller" variant="outline" size="sm">
          Back to seller area
        </Button>
      </div>
    </Alert>
  );
}

function TemporaryEntitlementNotice() {
  return (
    <Alert tone="info" title="Development entitlement">
      Publishing is currently gated only by an <strong>active seller</strong>{' '}
      account. Subscription and weekly-quota enforcement arrive in a later
      increment — there is no subscription or payment behind this yet.
    </Alert>
  );
}
