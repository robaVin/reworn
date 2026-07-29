import Link from 'next/link';
import Image from 'next/image';
import type { ConversationSummaryDTO } from '@/modules/messaging/dto';
import { formatDate } from '@/lib/format';

/**
 * One inbox row: a SINGLE primary link to the conversation thread
 * (/messages/[conversationId]). The whole card is the link with a descriptive
 * accessible name; there are no nested interactive controls.
 *
 * Renders ONLY public summary data (counterparty public name / handle, listing
 * title-or-snapshot, latest preview, activity time). No profile/seller/buyer
 * ids, emails, or auth ids are present in the DTO or the markup. The thumbnail
 * is decorative (alt=""): the listing title is adjacent text.
 */
export function InboxCard({
  conversation,
}: {
  conversation: ConversationSummaryDTO;
}) {
  const { id, listing, counterparty, lastMessagePreview, lastActivityAt } =
    conversation;
  const removed = listing.status === 'removed';
  const listingLabel = removed
    ? `${listing.title} (no longer available)`
    : listing.title;

  return (
    <Link
      href={`/messages/${id}`}
      aria-label={`Conversation with ${counterparty.displayName} about ${listing.title}`}
      className="flex gap-4 rounded-card border border-line bg-surface p-4 transition-colors hover:border-terracotta-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-control border border-line bg-sand">
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
            No image
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate font-display text-base font-semibold text-ink">
            {counterparty.displayName}
            {counterparty.kind === 'seller' && counterparty.handle && (
              <span className="ml-1 text-xs font-normal text-muted">
                @{counterparty.handle}
              </span>
            )}
          </span>
          <time
            dateTime={lastActivityAt.toISOString()}
            className="shrink-0 text-xs text-muted"
          >
            {formatDate(lastActivityAt)}
          </time>
        </div>

        <p className="mt-0.5 truncate text-sm text-muted">{listingLabel}</p>

        <p className="mt-1 truncate text-sm text-ink">
          {lastMessagePreview ?? (
            <span className="italic text-muted">No messages yet</span>
          )}
        </p>
      </div>
    </Link>
  );
}
