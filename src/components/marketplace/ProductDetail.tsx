import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PublicListingDetail } from '@/modules/catalog/public-catalog';
import { buildProductJsonLd } from '@/modules/catalog/product-jsonld';
import { deliveryMethodLabel } from '@/modules/catalog/delivery';
import { formatPrice, formatDate } from '@/lib/format';
import { ListingGallery } from './ListingGallery';
import { JsonLd } from '@/components/JsonLd';
import { Chip } from '@/components/ui/Chip';

/**
 * Presentational Product Detail body — pure and synchronous, so it renders in a
 * unit test with a mock listing. The auth-dependent message CTA and the related
 * products are passed in as already-wrapped `ReactNode` slots (each in its own
 * Suspense boundary in the page) so this component never blocks on auth or the
 * related query. Renders ONLY intentionally-public fields; no listing/seller/
 * profile UUIDs, storage keys, or payment ids appear in the output.
 */

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

/** Deterministic 0-360 hue for the no-photo placeholder tint. */
function hueFromSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
}

export function ProductDetail({
  listing,
  canonicalPath,
  absoluteUrl,
  cta,
  related,
}: {
  listing: PublicListingDetail;
  canonicalPath: string;
  absoluteUrl: string;
  cta: ReactNode;
  related: ReactNode;
}) {
  const conditionLabel = listing.condition
    ? (CONDITION_LABELS[listing.condition] ?? listing.condition)
    : null;
  void canonicalPath; // canonical is set via route metadata; kept for symmetry

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <JsonLd data={buildProductJsonLd(listing, absoluteUrl)} />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/browse" className="hover:text-ink">
              Browse
            </Link>
          </li>
          {listing.categoryName && listing.categorySlug && (
            <li className="flex items-center gap-1">
              <span aria-hidden>/</span>
              <Link
                href={`/browse?category=${listing.categorySlug}`}
                className="hover:text-ink"
              >
                {listing.categoryName}
              </Link>
            </li>
          )}
          <li className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <span className="text-ink" aria-current="page">
              {listing.title}
            </span>
          </li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <ListingGallery
          images={listing.images}
          title={listing.title}
          category={listing.categoryName ?? 'Tops'}
          tintHue={hueFromSlug(listing.slug ?? listing.title)}
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

          <p className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-forest/30 bg-forest/5 px-2.5 py-1 text-sm font-medium text-forest">
            <span aria-hidden>●</span> Available
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
            <Detail
              label="Listed"
              value={
                <time dateTime={listing.createdAt.toISOString()}>
                  {formatDate(listing.createdAt)}
                </time>
              }
            />
          </dl>

          <div className="mt-6 rounded-card border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-muted">
              Delivery
            </h2>
            <p className="mt-1 text-sm font-medium text-ink">
              {deliveryMethodLabel(listing.deliveryMethod)}
            </p>
            {listing.deliveryNote && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted">
                {listing.deliveryNote}
              </p>
            )}
          </div>

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
            {cta}
          </div>
        </div>
      </div>

      {related}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}
