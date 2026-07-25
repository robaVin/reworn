import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import { listSellerListingCards } from '@/modules/catalog/listing-service';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Your listings' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Live',
  paused: 'Paused',
  sold: 'Sold',
  archived: 'Archived',
};

const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-sand text-ink',
  published: 'bg-forest/10 text-forest',
  paused: 'bg-terracotta/10 text-terracotta-strong',
  sold: 'bg-ink/10 text-ink',
  archived: 'bg-ink/5 text-muted',
};

function formatPrice(minor: number | null, currency: string): string {
  if (minor === null) return 'No price';
  return `${(minor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatUpdated(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Seller listings — the seller's OWN listings (any status), newest-updated
 * first, with a signed cover thumbnail. Visible to the owner regardless of the
 * public marketplace. Full lifecycle actions arrive in a later increment.
 */
export default async function SellerListingsPage() {
  const ctx = await requireAnyRolePage(['seller', 'admin'], '/seller/listings');
  const listings = await listSellerListingCards(ctx.userId);

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
            Seller studio
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
            Your listings
          </h1>
        </div>
        <Button href="/seller/listings/new">New listing</Button>
      </div>

      {listings.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No listings yet"
            action={
              <Button href="/seller/listings/new">Create a listing</Button>
            }
          >
            Create your first listing — add photos, set a price, and publish
            when it’s ready.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => (
            <li
              key={l.id}
              className="overflow-hidden rounded-card border border-line bg-surface shadow-soft"
            >
              <Link
                href={`/seller/listings/${l.id}/edit`}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-strong"
              >
                <div className="relative aspect-[4/3] bg-sand">
                  {l.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-xs text-muted">
                      No photo yet
                    </div>
                  )}
                  <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      STATUS_CLASSES[l.status] ?? 'bg-sand text-ink'
                    }`}
                  >
                    {STATUS_LABELS[l.status] ?? l.status}
                  </span>
                </div>
                <div className="p-4">
                  <h2 className="truncate font-display text-base font-semibold text-ink">
                    {l.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {formatPrice(l.priceMinor, l.currency)}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Updated {formatUpdated(l.updatedAt)}
                  </p>
                </div>
              </Link>
              <div className="border-t border-line px-4 py-3">
                <Button
                  href={`/seller/listings/${l.id}/edit`}
                  variant="outline"
                  size="sm"
                >
                  {l.status === 'draft' ? 'Continue draft' : 'Edit'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
