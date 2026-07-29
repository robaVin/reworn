import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublicListing } from '@/modules/catalog/public-catalog';
import { formatPrice } from '@/lib/format';
import { ListingGallery } from '@/components/marketplace/ListingGallery';
import { Chip } from '@/components/ui/Chip';

export const dynamic = 'force-dynamic';

const CONDITION_LABELS: Record<string, string> = {
  new: 'New with tags',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
};
const GENDER_LABELS: Record<string, string> = {
  women: 'Women',
  men: 'Men',
  kids: 'Kids',
  unisex: 'Unisex',
};

function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ listingId: string }>;
}): Promise<Metadata> {
  const { listingId } = await params;
  const listing = await getPublicListing(listingId);
  if (!listing) return { title: 'Listing not found', robots: { index: false } };

  const description = (
    listing.description ?? `${listing.brand ?? ''} ${listing.title}`.trim()
  ).slice(0, 160);

  return {
    title: listing.title,
    description,
    alternates: { canonical: `/listing/${listing.id}` },
    openGraph: {
      title: listing.title,
      description,
      type: 'website',
      url: `/listing/${listing.id}`,
      images: listing.coverUrl ? [{ url: listing.coverUrl }] : [],
    },
    robots: { index: true, follow: true },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  const listing = await getPublicListing(listingId);
  if (!listing) notFound();

  const conditionLabel = listing.condition
    ? (CONDITION_LABELS[listing.condition] ?? listing.condition)
    : null;

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <Link href="/browse" className="hover:text-ink">
          Browse
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink">{listing.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ListingGallery
          images={listing.images}
          title={listing.title}
          category={listing.categoryName ?? 'Tops'}
          tintHue={hueFromId(listing.id)}
        />

        <div>
          {listing.brand && (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {listing.brand}
            </p>
          )}
          <h1 className="mt-1 font-display text-3xl font-bold text-ink">
            {listing.title}
          </h1>

          <div className="mt-4 flex items-end gap-3">
            <span className="text-2xl font-bold text-ink">
              {listing.priceMinor !== null
                ? formatPrice(listing.priceMinor, listing.currency)
                : 'Price on request'}
            </span>
            {listing.originalPriceMinor !== null &&
              listing.priceMinor !== null &&
              listing.originalPriceMinor > listing.priceMinor && (
                <span className="text-sm text-muted line-through">
                  {formatPrice(listing.originalPriceMinor, listing.currency)}
                </span>
              )}
          </div>
          <p className="mt-1 text-xs text-muted">
            Price is informational — payment and delivery are arranged directly
            with the seller.
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {listing.size && <Detail label="Size" value={listing.size} />}
            {conditionLabel && (
              <Detail label="Condition" value={conditionLabel} />
            )}
            {listing.categoryName && (
              <Detail label="Category" value={listing.categoryName} />
            )}
            <Detail
              label="Department"
              value={GENDER_LABELS[listing.gender] ?? listing.gender}
            />
            {listing.color && <Detail label="Colour" value={listing.color} />}
            {listing.material && (
              <Detail label="Material" value={listing.material} />
            )}
            {listing.location && (
              <Detail label="Location" value={listing.location} />
            )}
          </dl>

          {listing.description && (
            <div className="mt-6">
              <h2 className="font-display text-lg font-semibold text-ink">
                Description
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                {listing.description}
              </p>
            </div>
          )}

          <div className="mt-8 rounded-card border border-line bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Seller</p>
            <Link
              href={`/shop/${listing.seller.handle}`}
              className="mt-1 inline-block font-display text-lg font-semibold text-ink hover:text-terracotta-strong"
            >
              {listing.seller.shopName}
            </Link>
            <div className="mt-2">
              <Chip href={`/shop/${listing.seller.handle}`}>
                View seller’s items
              </Chip>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
