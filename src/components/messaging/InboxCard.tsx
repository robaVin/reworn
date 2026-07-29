import Image from 'next/image';
import type { ConversationSummaryDTO } from '@/modules/messaging/dto';
import { formatDate } from '@/lib/format';

/**
 * One inbox row. Display-only in 3B-B — the conversation thread route
 * (/messages/[conversationId]) ships in 3B-C, at which point cards become links.
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
  const { listing, counterparty, lastMessagePreview, lastActivityAt } =
    conversation;
  const removed = listing.status === 'removed';

  return (
    <article className="flex gap-4 rounded-card border border-line bg-surface p-4">
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
          <h2 className="min-w-0 truncate font-display text-base font-semibold text-ink">
            {counterparty.displayName}
            {counterparty.kind === 'seller' && counterparty.handle && (
              <span className="ml-1 text-xs font-normal text-muted">
                @{counterparty.handle}
              </span>
            )}
          </h2>
          <time
            dateTime={lastActivityAt.toISOString()}
            className="shrink-0 text-xs text-muted"
          >
            {formatDate(lastActivityAt)}
          </time>
        </div>

        <p className="mt-0.5 truncate text-sm text-muted">
          {removed ? `${listing.title} (no longer available)` : listing.title}
        </p>

        <p className="mt-1 truncate text-sm text-ink">
          {lastMessagePreview ?? (
            <span className="italic text-muted">No messages yet</span>
          )}
        </p>
      </div>
    </article>
  );
}
