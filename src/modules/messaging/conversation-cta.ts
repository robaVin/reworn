/**
 * Pure, client-safe types + copy for the "Message seller" flow.
 *
 * NO server-only imports: this module is consumed by both the server action and
 * the client form component, so it must stay free of Prisma / auth / node deps.
 * User-facing copy is deliberately generic (never leaks whether a listing or a
 * conversation exists, never mentions ids).
 */

/** Non-redirect failure categories surfaced by the creation action. */
export type ConversationErrorKind =
  'notFound' | 'ownListing' | 'rateLimited' | 'validationError' | 'unexpected';

/** useActionState state for the creation form. Success is a redirect, not a state. */
export type StartConversationState =
  { status: 'idle' } | { status: 'error'; error: ConversationErrorKind };

export const INITIAL_CONVERSATION_STATE: StartConversationState = {
  status: 'idle',
};

/**
 * Maps a failure kind to its stable catalog key under `Messages.conversationError`.
 * Pure and client-safe — the consumer translates the returned key with next-intl.
 */
export function conversationErrorMessageKey(
  kind: ConversationErrorKind,
): string {
  switch (kind) {
    case 'notFound':
    case 'ownListing':
    case 'rateLimited':
      return kind;
    case 'validationError':
    case 'unexpected':
    default:
      return 'generic';
  }
}

/** Safe, generic user-facing message for a failure kind (no ids, no internals). */
export function conversationErrorMessage(kind: ConversationErrorKind): string {
  switch (kind) {
    case 'notFound':
      return 'This listing is no longer available.';
    case 'ownListing':
      return 'This is your own listing.';
    case 'rateLimited':
      return 'You are doing that too quickly. Please wait a moment and try again.';
    case 'validationError':
    case 'unexpected':
    default:
      return 'Something went wrong. Please try again.';
  }
}
