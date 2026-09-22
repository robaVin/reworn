import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { SellerListingCard } from '@/modules/catalog/listing-service';
import { ListingStatusBadge } from '@/components/seller/ListingStatusBadge';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/format';

/**
 * "Your listings" — the dashboard's PRIMARY section. A small preview of the
 * seller's real listings (any status), newest-updated first, each linking to the
 * existing management/edit surface. "View all" links to the full listings route
 * (retained). No status is inferred client-side; the rows are authoritative.
 */
export async function DashboardListings({
  listings,
}: {
  listings: SellerListingCard[];
}) {
  const t = await getTranslations('Sell');

  return (
    <section
      aria-labelledby="dash-listings-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="dash-listings-heading"
          className="font-display text-xl font-bold text-ink"
        >
          {t('listings.heading')}
        </h2>
        {listings.length > 0 && (
          <Link
            href="/seller/listings"
            className="text-sm font-semibold text-terracotta-strong hover:text-terracotta-hover"
          >
            {t('dashboard.viewAllListings')} →
          </Link>
        )}
      </div>

      {listings.length === 0 ? (
        <div className="mt-4 rounded-card border border-dashed border-line bg-cream/60 p-6 text-center">
          <p className="text-sm text-muted">{t('dashboard.listingsEmpty')}</p>
          <div className="mt-4">
            <Button href="/sell">{t('dashboard.sellFirstItem')}</Button>
          </div>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {listings.map((l) => (
            <li key={l.id}>
              <Link
                href={`/seller/listings/${l.id}/edit`}
                className="flex items-center gap-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-strong"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {l.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-[10px] text-muted">
                      {t('listings.noPhoto')}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{l.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {l.priceMinor !== null
                      ? formatPrice(l.priceMinor, l.currency)
                      : t('noPrice')}
                  </p>
                </div>
                <ListingStatusBadge status={l.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
