import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requireUserPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listConversationSummariesForCurrentUser } from '@/modules/messaging/service';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';
import { InboxCard } from '@/components/messaging/InboxCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { MessageIcon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';

/**
 * Authenticated inbox — the current user's conversations, newest activity first,
 * keyset-paginated. Private content: robots noindex,nofollow and a bare
 * self-canonical so paginated (?cursor=) URLs are never promoted or indexed.
 * The message thread (/messages/[conversationId]) and composer ship in 3B-C, so
 * rows are display-only here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Messages');
  return {
    title: t('inboxTitle'),
    alternates: { canonical: '/messages' },
    robots: { index: false, follow: false },
  };
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Fail closed when auth isn't configured (mirrors the other guarded routes).
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  // Unauthenticated -> redirect to /login?next=/messages (existing auth flow).
  const { userId } = await requireUserPage('/messages');
  const t = await getTranslations('Messages');

  const sp = await searchParams;
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;
  const page = await listConversationSummariesForCurrentUser(userId, cursor);
  const nextHref = page.nextCursor
    ? `/messages?cursor=${encodeURIComponent(page.nextCursor)}`
    : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('inboxTitle')}
      </h1>

      {/* Focus/scroll target so "Older conversations" returns keyboard users to
          the top of the refreshed list. */}
      <div id="inbox" tabIndex={-1} className="scroll-mt-24 outline-none">
        {page.items.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon={<MessageIcon />} title={t('emptyInboxTitle')}>
              {t('emptyInboxBody')}
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="mt-8 space-y-3">
              {page.items.map((conversation) => (
                <li key={conversation.id}>
                  <InboxCard conversation={conversation} />
                </li>
              ))}
            </ul>
            <nav aria-label="Pagination" className="mt-8 flex justify-center">
              {nextHref ? (
                <Button href={`${nextHref}#inbox`} variant="outline">
                  {t('olderConversations')}
                </Button>
              ) : (
                <p className="text-sm text-muted">{t('endOfList')}</p>
              )}
            </nav>
          </>
        )}
      </div>
    </main>
  );
}
