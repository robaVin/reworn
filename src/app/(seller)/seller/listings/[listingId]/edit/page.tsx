import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import {
  getOwnedListing,
  listActiveCategories,
} from '@/modules/catalog/listing-service';
import { isEditable } from '@/modules/catalog/listing-status';
import { CreateListingForm } from '@/components/seller/CreateListingForm';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Edit listing' };
export const dynamic = 'force-dynamic';

/**
 * Edit / continue an existing listing. Ownership is enforced server-side
 * (`getOwnedListing` → notFound for non-owners). Editable listings (draft /
 * paused) open the same autosave form used for creation, prefilled and with the
 * image manager bound to the listing. Non-editable listings show a truthful
 * read-only notice (lifecycle actions arrive in a later increment).
 */
export default async function EditListingPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  const ctx = await requireAnyRolePage(
    ['seller', 'admin'],
    `/seller/listings/${listingId}/edit`,
  );

  const listing = await getOwnedListing(ctx.userId, listingId);
  if (!listing) notFound();

  const editable = isEditable(listing.status);
  const categories = editable ? await listActiveCategories() : [];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Seller studio
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        {editable ? 'Edit listing' : 'Listing'}
      </h1>

      <div className="mt-8">
        {editable ? (
          <CreateListingForm
            categories={categories}
            initial={{
              id: listing.id,
              status: 'draft',
              fields: {
                title: listing.title,
                description: listing.description ?? '',
                categoryId: listing.categoryId ?? '',
                brand: listing.brand ?? '',
                condition: listing.condition ?? '',
                size: listing.size ?? '',
                color: listing.color ?? '',
                material: listing.material ?? '',
                gender: listing.gender,
                price:
                  listing.priceMinor !== null
                    ? String(listing.priceMinor / 100)
                    : '',
                currency: listing.currency,
                location: listing.location ?? '',
              },
            }}
          />
        ) : (
          <>
            <Alert tone="info" title={`This listing is ${listing.status}`}>
              Editing and lifecycle actions for {listing.status} listings arrive
              in a later increment. You can still see it in your listings.
            </Alert>
            <div className="mt-4">
              <Button href="/seller/listings" variant="outline">
                Back to your listings
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
