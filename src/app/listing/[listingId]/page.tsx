import { notFound, permanentRedirect } from 'next/navigation';
import { getPublicListing } from '@/modules/catalog/public-catalog';

export const dynamic = 'force-dynamic';

/**
 * Legacy listing route — retained for existing/inbound links. A valid PUBLIC
 * listing is resolved to its canonical stored slug and 308-redirected to
 * `/products/[slug]`, so there is exactly one canonical URL per listing.
 *
 * Unknown, malformed, or non-public ids fall through to `notFound()`, preserving
 * the existing indistinguishable behavior (a draft/paused/archived listing looks
 * exactly like a missing one). `getPublicListing` already hard-filters
 * `status='published'` and rejects malformed ids, so a non-owner can never tell
 * a hidden listing exists.
 */
export default async function LegacyListingRedirect({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  const listing = await getPublicListing(listingId);
  if (!listing || !listing.slug) notFound();
  permanentRedirect(`/products/${listing.slug}`);
}
