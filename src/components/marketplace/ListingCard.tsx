import Link from 'next/link';
import Image from 'next/image';
import type { ListingCardData } from '@/modules/catalog/types';
import { formatPrice } from '@/lib/format';
import { GarmentGlyph } from './GarmentGlyph';

/**
 * Listing card — the prototype's `.card` with 3:4 imagery, rounded corners
 * and warm borders.
 *
 * With `href` the whole card is a link to the listing detail (catalog
 * increment). WITHOUT `href` it renders as a non-interactive display card —
 * used for editorial design samples, which must never expose save/message/
 * detail actions.
 *
 * The save (heart) action intentionally does not exist yet: it arrives with
 * the saved-items domain, wired to the real service. No fake mutations.
 */
export function ListingCard({
  listing,
  href,
}: {
  listing: ListingCardData;
  href?: string;
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
            alt=""
            fill
            sizes="(max-width: 380px) 100vw, (max-width: 1024px) 50vw, 25vw"
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
          Size {listing.size} · {listing.category}
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
      <Link
        href={href}
        className={`${cardClasses} hover:-translate-y-1.5 hover:border-terracotta hover:shadow-lift motion-reduce:hover:translate-y-0`}
      >
        {body}
      </Link>
    );
  }

  return <article className={cardClasses}>{body}</article>;
}
