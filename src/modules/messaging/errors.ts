/**
 * Messaging-domain errors. Authorization / existence failures reuse
 * {@link AuthorizationError} (401/403/404) so a non-participant learns nothing
 * about whether a conversation, listing or seller exists. A rejected message
 * body is a 422 (understood, but not storable as written).
 */
export class MessageRejectedError extends Error {
  readonly status = 422 as const;
  constructor(readonly reason: string) {
    super(`message_rejected:${reason}`);
    this.name = 'MessageRejectedError';
  }
}
