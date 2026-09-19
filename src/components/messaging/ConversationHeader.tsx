import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { ConversationDTO } from '@/modules/messaging/dto';
import { formatPrice } from '@/lib/format';

/**
 * Thread context header. Renders participant-authorized DTO data only — the
 * counterparty public name (+ shop handle for a seller) and the listing context
 * (live title/price/cover or the immutable snapshot for a removed listing). No
 * profile/seller/owner ids are present.
 *
 * The listing links to /listing/[id] ONLY when the listing is currently public
 * (published) — a paused/archived/removed listing would 404 there for the
 * participant, so it is shown as text with an "unavailable" note instead.
 */
export async function ConversationHeader({
  context,
}: {
  context: ConversationDTO;
}) {
  const t = await getTranslations('Messages');
  const { listing, counterparty } = context;
  const removed = listing.status === 'removed';
  const linkable = listing.status === 'published' && listing.id !== null;

  const titleNote = removed
    ? ` (${t('listingRemovedNote')})`
    : linkable
      ? ''
      : ` (${t('listingUnavailableNote')})`;

  return (
    <header className="border-b border-line pb-6">
      <p className="text-xs uppercase tracking-wide text-muted">
        {t('conversationWith')}
      </p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">
        {counterparty.displayName}
      </h1>
      {counterparty.kind === 'seller' && counterparty.handle && (
        <Link
          href={`/shop/${counterparty.handle}`}
          className="text-sm text-muted hover:text-terracotta-strong"
        >
          @{counterparty.handle}
        </Link>
      )}

      <div className="mt-4 flex gap-4 rounded-card border border-line bg-surface p-4">
        <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-control border border-line bg-sand">
          {listing.coverUrl ? (
            <Image
              src={listing.coverUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="grid h-full w-full place-items-center px-1 text-center text-[10px] leading-tight text-muted"
            >
              {t('noImage')}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold text-ink">
            {listing.title}
            {titleNote && (
              <span className="font-normal text-muted">{titleNote}</span>
            )}
          </p>
          {listing.priceMinor !== null && (
            <p className="mt-1 text-sm text-ink">
              {formatPrice(listing.priceMinor, listing.currency)}
            </p>
          )}
          {linkable && (
            <Link
              href={`/listing/${listing.id}`}
              className="mt-2 inline-block text-sm font-semibold text-terracotta-strong hover:underline"
            >
              {t('viewListing')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
