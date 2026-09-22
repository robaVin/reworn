import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ConversationSummaryDTO } from '@/modules/messaging/dto';

/**
 * Recent conversations preview — REAL messaging data, scoped to the authenticated
 * participant by the existing messaging service. Shows only what the inbox already
 * exposes (listing title, counterparty display name, safe preview) — never another
 * user's private data, and no unread/read-state (not implemented). Titles and
 * names are user content and are never translated.
 */
export async function RecentConversations({
  conversations,
}: {
  conversations: ConversationSummaryDTO[];
}) {
  const t = await getTranslations('Sell');
  return (
    <section
      aria-labelledby="dash-convos-heading"
      className="rounded-card border border-line bg-surface p-5 shadow-soft"
    >
      <div className="flex items-center justify-between gap-4">
        <h2
          id="dash-convos-heading"
          className="font-display text-lg font-bold text-ink"
        >
          {t('dashboard.conversationsHeading')}
        </h2>
        {conversations.length > 0 && (
          <Link
            href="/messages"
            className="text-sm font-semibold text-terracotta-strong hover:text-terracotta-hover"
          >
            {t('dashboard.viewMessages')} →
          </Link>
        )}
      </div>

      {conversations.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {t('dashboard.conversationsEmpty')}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${c.id}`}
                className="flex items-center gap-3 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-strong"
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {c.listing.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.listing.coverUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {c.listing.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {c.counterparty.displayName}
                    {c.lastMessagePreview ? ` · ${c.lastMessagePreview}` : ''}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
