import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
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

/** Deterministic 0-360 hue for the no-photo placeholder tint. */
function hueFromSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) % 360;
  return h;
}

export async function ProductDetail({
  listing,
  canonicalPath,
  absoluteUrl,
  cta,
  related,
  saveControl,
}: {
  listing: PublicListingDetail;
  canonicalPath: string;
  absoluteUrl: string;
  cta: ReactNode;
  related: ReactNode;
  /** The Save (wishlist) heart. Provided by the page for a published listing;
   *  omitted for a sold listing (no availability/save action on sold). */
  saveControl?: ReactNode;
}) {
  const t = await getTranslations('Listing');
  const tCat = await getTranslations('Categories');
  const conditionLabel = listing.condition
    ? t.has(`condition.${listing.condition}`)
      ? t(`condition.${listing.condition}`)
      : listing.condition
    : null;
  const genderLabel = t.has(`gender.${listing.gender}`)
    ? t(`gender.${listing.gender}`)
    : listing.gender;
  // Localize the category DISPLAY name by its canonical slug; fall back to the
  // stored English name when the slug isn't in the Categories catalog.
  const categoryLabel =
    listing.categorySlug && tCat.has(listing.categorySlug)
      ? tCat(listing.categorySlug)
      : listing.categoryName;
  void canonicalPath; // canonical is set via route metadata; kept for symmetry

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <JsonLd data={buildProductJsonLd(listing, absoluteUrl)} />

      <nav
        aria-label={t('breadcrumbLabel')}
        className="mb-6 text-sm text-muted"
      >
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/browse" className="hover:text-ink">
              {t('breadcrumbBrowse')}
            </Link>
          </li>
          {listing.categoryName && listing.categorySlug && (
            <li className="flex items-center gap-1">
              <span aria-hidden>/</span>
              <Link
                href={`/browse?category=${listing.categorySlug}`}
                className="hover:text-ink"
              >
                {categoryLabel}
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
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1 className="font-display text-3xl font-bold text-ink">
              {listing.title}
            </h1>
            {saveControl && <div className="shrink-0">{saveControl}</div>}
          </div>

          <div className="mt-4 flex items-end gap-3">
            <span className="text-2xl font-bold text-ink">
              {listing.priceMinor !== null
                ? formatPrice(listing.priceMinor, listing.currency)
                : t('priceOnRequest')}
            </span>
            {listing.originalPriceMinor !== null &&
              listing.priceMinor !== null &&
              listing.originalPriceMinor > listing.priceMinor && (
                <span className="text-sm text-muted line-through">
                  {formatPrice(listing.originalPriceMinor, listing.currency)}
                </span>
              )}
          </div>
          <p className="mt-1 text-xs text-muted">{t('priceDisclaimer')}</p>

          {listing.status === 'sold' ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-ink/20 bg-ink/5 px-2.5 py-1 text-sm font-semibold text-ink">
              <span aria-hidden>✓</span> {t('soldLabel')}
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-control border border-forest/30 bg-forest/5 px-2.5 py-1 text-sm font-medium text-forest">
              <span aria-hidden>●</span> {t('available')}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {listing.size && (
              <Detail label={t('sizeLabel')} value={listing.size} />
            )}
            {conditionLabel && (
              <Detail label={t('conditionLabel')} value={conditionLabel} />
            )}
            {categoryLabel && (
              <Detail label={t('categoryLabel')} value={categoryLabel} />
            )}
            <Detail label={t('departmentLabel')} value={genderLabel} />
            {listing.color && (
              <Detail label={t('colourLabel')} value={listing.color} />
            )}
            {listing.material && (
              <Detail label={t('materialLabel')} value={listing.material} />
            )}
            {listing.location && (
              <Detail label={t('locationLabel')} value={listing.location} />
            )}
            <Detail
              label={t('listedLabel')}
              value={
                <time dateTime={listing.createdAt.toISOString()}>
                  {formatDate(listing.createdAt)}
                </time>
              }
            />
          </dl>

          <div className="mt-6 rounded-card border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wide text-muted">
              {t('deliveryHeading')}
            </h2>
            <p className="mt-1 text-sm font-medium text-ink">
              {t.has(`deliveryMethod.${listing.deliveryMethod}`)
                ? t(`deliveryMethod.${listing.deliveryMethod}`)
                : deliveryMethodLabel(listing.deliveryMethod)}
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
                {t('descriptionHeading')}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                {listing.description}
              </p>
            </div>
          )}

          <div className="mt-8 rounded-card border border-line bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted">
              {t('sellerHeading')}
            </p>
            <Link
              href={`/shop/${listing.seller.handle}`}
              className="mt-1 inline-block font-display text-lg font-semibold text-ink hover:text-terracotta-strong"
            >
              {listing.seller.shopName}
            </Link>
            <div className="mt-2">
              <Chip href={`/shop/${listing.seller.handle}`}>
                {t('viewSellerItems')}
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
