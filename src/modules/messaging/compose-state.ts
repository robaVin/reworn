/**
 * Pure, client-safe types + copy for the message composer. NO server-only
 * imports (consumed by the client composer AND the server action). Copy is
 * generic and never leaks whether a conversation exists or any identity.
 */

export type SendErrorKind =
  | 'empty'
  | 'tooLong'
  | 'controlChar'
  | 'notFound'
  | 'rateLimited'
  | 'validationError'
  | 'unexpected';

/** useActionState state for the composer. Success is a redirect, not a state. */
export type SendMessageState =
  { status: 'idle' } | { status: 'error'; error: SendErrorKind };

export const INITIAL_SEND_STATE: SendMessageState = { status: 'idle' };

/** Safe, generic user-facing message for a send failure (no ids/internals). */
export function sendErrorMessage(kind: SendErrorKind): string {
  switch (kind) {
    case 'empty':
      return 'Enter a message.';
    case 'tooLong':
      return 'Messages can contain up to 4000 characters.';
    case 'controlChar':
      return 'This message contains unsupported characters.';
    case 'notFound':
      return 'This conversation is no longer available.';
    case 'rateLimited':
      return 'You are sending messages too quickly. Please wait a moment and try again.';
    case 'validationError':
    case 'unexpected':
    default:
      return 'Something went wrong. Please try again.';
  }
}
