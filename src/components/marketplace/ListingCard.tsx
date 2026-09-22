import Link from 'next/link';
import Image from 'next/image';
import type { ListingCardData } from '@/modules/catalog/types';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/cn';
import { GarmentGlyph } from './GarmentGlyph';
import { SaveButton } from './SaveButton';

/**
 * Listing card — the prototype's `.card` with 3:4 imagery, rounded corners
 * and warm borders.
 *
 * With `href` the whole card is a link to the listing detail, and a Save
 * (wishlist) heart is overlaid as a SIBLING of the link (never nested inside
 * it). WITHOUT `href` it renders as a non-interactive display card — used for
 * editorial design samples, which must never expose save/message/detail actions
 * (so no heart there).
 */
export function ListingCard({
  listing,
  href,
  priority = false,
  sizeLabel = 'Size',
  saved = false,
  authenticated = false,
  soldLabel,
}: {
  listing: ListingCardData;
  href?: string;
  /** Above-the-fold cover: load eagerly with `priority` (skips lazy loading). */
  priority?: boolean;
  /**
   * Localized "Size" prefix. Passed by `ListingGrid` (server-side, via
   * next-intl); defaults to English so the pure component still renders
   * standalone (e.g. in unit tests) without an intl context.
   */
  sizeLabel?: string;
  /** Whether the authenticated user has already saved this listing. */
  saved?: boolean;
  /** Whether the viewer is signed in (drives the heart's save vs login flow). */
  authenticated?: boolean;
  /** Localized "Sold" label for a saved-then-sold listing (only /saved sets it). */
  soldLabel?: string;
}) {
  const body = (
    <>
      <div className="relative aspect-listing overflow-hidden">
        {listing.tag && (
          <span className="absolute left-2.5 top-2.5 z-10 rounded-control bg-terracotta-strong px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-[0.09em] text-cream">
            {listing.tag}
          </span>
        )}
        {listing.imageUrl ? (
          <Image
            src={listing.imageUrl}
            alt={
              listing.brand
                ? `${listing.brand} ${listing.title}`
                : listing.title
            }
            fill
            sizes="(max-width: 380px) 100vw, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <GarmentGlyph category={listing.category} hue={listing.tintHue} />
        )}
      </div>
      <div className="flex flex-1 flex-col p-3.5 pb-4">
        <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted">
          {listing.brand}
        </p>
        <p className="mt-1 font-display text-base font-semibold leading-tight text-ink">
          {listing.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {sizeLabel} {listing.size} · {listing.category}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-ink">
            {formatPrice(listing.priceMinor, listing.currency)}
          </span>
          <span className="rounded-control border border-line px-2.5 py-0.5 text-[10.5px] text-muted">
            {listing.condition}
          </span>
        </div>
      </div>
    </>
  );

  const cardClasses =
    'group flex flex-col overflow-hidden rounded-card border border-line bg-surface ' +
    'transition-[transform,box-shadow,border-color] duration-300';

  if (href) {
    return (
      <article
        className={cn(
          'relative',
          cardClasses,
          'hover:-translate-y-1.5 hover:border-terracotta hover:shadow-lift motion-reduce:hover:translate-y-0',
        )}
      >
        <Link
          href={href}
          className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-strong"
        >
          {body}
        </Link>

        {listing.status === 'sold' && (
          <span className="absolute left-2.5 top-2.5 z-10 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cream">
            {soldLabel ?? 'Sold'}
          </span>
        )}

        <SaveButton
          listingId={listing.id}
          initialSaved={saved}
          authenticated={authenticated}
          returnPath={href}
          className="absolute right-2 top-2 z-10"
        />
      </article>
    );
  }

  return <article className={cardClasses}>{body}</article>;
}
