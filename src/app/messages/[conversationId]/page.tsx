import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUserPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  getConversationForCurrentUser,
  listRecentConversationMessages,
} from '@/modules/messaging/service';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';
import { ConversationHeader } from '@/components/messaging/ConversationHeader';
import { ConversationMessages } from '@/components/messaging/ConversationMessages';
import { MessageComposer } from '@/components/messaging/MessageComposer';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

/**
 * GENERIC static metadata only — never loads the private conversation (so
 * metadata cannot leak the counterparty, listing title, message bodies, or ids,
 * and the private query is not duplicated). Unknown/unauthorized threads use the
 * same generic noindex metadata and then notFound() in the page body.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}): Promise<Metadata> {
  const { conversationId } = await params;
  return {
    title: 'Conversation — ReWorn',
    alternates: { canonical: `/messages/${conversationId}` },
    robots: { index: false, follow: false },
  };
}

export default async function ConversationThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  const { conversationId } = await params;
  // Unauthenticated -> /login?next=/messages/[id]; then read below.
  const { userId } = await requireUserPage(`/messages/${conversationId}`);

  // Participant gate + context in one call. Null = missing OR not a participant
  // OR malformed id -> the SAME not-found (no existence signal). Uses the private
  // participant-authorized DTO (NOT the public listing service), so paused /
  // archived / removed listings stay visible to participants.
  const context = await getConversationForCurrentUser(userId, conversationId);
  if (!context) notFound();

  const sp = await searchParams;
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined;
  const page = await listRecentConversationMessages(
    userId,
    conversationId,
    cursor,
  );
  const olderHref = page.olderCursor
    ? `/messages/${conversationId}?cursor=${encodeURIComponent(page.olderCursor)}`
    : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <p className="mb-4">
        <Button href="/messages" variant="ghost" size="sm">
          ← All messages
        </Button>
      </p>

      <ConversationHeader context={context} />

      <div id="thread" tabIndex={-1} className="scroll-mt-24 outline-none">
        {/* "Load older" sits ABOVE the window because messages read oldest→newest
            downward; loading older prepends earlier history. */}
        <nav aria-label="Older messages" className="mt-8 flex justify-center">
          {olderHref ? (
            <Button href={`${olderHref}#thread`} variant="outline" size="sm">
              Load older messages
            </Button>
          ) : (
            <p className="text-xs text-muted">Start of the conversation.</p>
          )}
        </nav>

        <ConversationMessages
          messages={page.items}
          counterpartyName={context.counterparty.displayName}
        />

        {/* On a historical (?cursor=) page, offer a clear return to the latest
            thread. The composer stays visible on every page; a successful send
            always redirects to the bare /messages/[id] (latest), so a new
            message is never appended to an older window. */}
        {cursor && (
          <p className="mt-6 text-center">
            <Button
              href={`/messages/${conversationId}#thread`}
              variant="ghost"
              size="sm"
            >
              Back to latest messages
            </Button>
          </p>
        )}

        <MessageComposer conversationId={conversationId} />
      </div>
    </main>
  );
}
