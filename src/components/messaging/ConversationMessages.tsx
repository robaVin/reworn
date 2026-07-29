import type { MessageDTO } from '@/modules/messaging/dto';
import { formatDateTime } from '@/lib/format';

/**
 * Chronological message list (oldest→newest within the visible window).
 *
 * Sender context is TEXTUAL ("You" or the counterparty's public name) and
 * structural (alignment + border), never colour alone and never an id. Bodies
 * render as plain text with intentional newlines preserved (`whitespace-pre-line`)
 * — React escapes them, so HTML-like content is shown literally; there is no
 * `dangerouslySetInnerHTML` and no auto-linking.
 */

function MessageBubble({
  message,
  counterpartyName,
}: {
  message: MessageDTO;
  counterpartyName: string;
}) {
  const sender = message.sentByViewer ? 'You' : counterpartyName;
  return (
    <li
      className={
        message.sentByViewer ? 'flex justify-end' : 'flex justify-start'
      }
    >
      <article
        className={[
          'max-w-[85%] rounded-card border px-4 py-3',
          message.sentByViewer
            ? 'border-terracotta-strong bg-sand'
            : 'border-line bg-surface',
        ].join(' ')}
      >
        <p className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
          <span className="font-semibold text-ink">{sender}</span>
          <time dateTime={message.createdAt.toISOString()}>
            {formatDateTime(message.createdAt)}
          </time>
        </p>
        <p className="whitespace-pre-line break-words text-sm text-ink">
          {message.body}
        </p>
      </article>
    </li>
  );
}

export function ConversationMessages({
  messages,
  counterpartyName,
}: {
  messages: MessageDTO[];
  counterpartyName: string;
}) {
  if (messages.length === 0) {
    return (
      <p className="mt-8 rounded-card border border-line bg-surface px-4 py-10 text-center text-sm text-muted">
        No messages yet.
      </p>
    );
  }

  return (
    <ol className="mt-8 space-y-3">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          counterpartyName={counterpartyName}
        />
      ))}
    </ol>
  );
}
