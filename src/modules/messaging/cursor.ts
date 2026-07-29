/**
 * Opaque, versioned keyset cursors for messaging.
 *
 * Two shapes, both base64url-encoded JSON:
 *   - MESSAGE cursor: pages a single conversation's messages (created_at ASC,
 *     id ASC). Bound to the conversation id, so a cursor minted for conversation
 *     A is rejected when replayed against conversation B.
 *   - SUMMARY cursor: pages a participant's conversation list (last_message_at
 *     DESC, id DESC). Bound to the authenticated participant's profile id, so a
 *     cursor cannot be replayed by (or against) another user.
 *
 * The client never supplies column names or ordering; only this validated
 * payload steers the keyset predicate. Any malformed / mismatched / tampered
 * cursor decodes to null, and the caller resets to the first page.
 */

const MESSAGE_CURSOR_VERSION = 1 as const;
const SUMMARY_CURSOR_VERSION = 1 as const;

const UUID_RE = /^[0-9a-f-]{36}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isValidIsoInstant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeJson(raw: string): Record<string, unknown> | null {
  let obj: unknown;
  try {
    obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  return obj as Record<string, unknown>;
}

/* -------------------------------- messages -------------------------------- */

export interface MessageCursor {
  /** ISO timestamp of the boundary message's created_at. */
  createdAt: string;
  /** UUID tiebreaker. */
  id: string;
}

export function encodeMessageCursor(
  conversationId: string,
  cursor: MessageCursor,
): string {
  return encode({
    v: MESSAGE_CURSOR_VERSION,
    c: conversationId,
    t: cursor.createdAt,
    id: cursor.id,
  });
}

/**
 * Decode a message cursor, requiring it to belong to `conversationId`. Returns
 * null on any malformed base64 / invalid JSON / unknown version / invalid
 * timestamp / invalid UUID / conversation mismatch.
 */
export function decodeMessageCursor(
  raw: string | undefined,
  conversationId: string,
): MessageCursor | null {
  if (!raw) return null;
  const p = decodeJson(raw);
  if (!p) return null;
  if (p.v !== MESSAGE_CURSOR_VERSION) return null;
  if (p.c !== conversationId) return null; // reuse against another conversation
  if (!isValidIsoInstant(p.t)) return null;
  if (!isValidUuid(p.id)) return null;
  return { createdAt: p.t, id: p.id };
}

/* ------------------------------- summaries -------------------------------- */

export interface SummaryCursor {
  /** ISO timestamp of the boundary conversation's last_message_at. */
  lastMessageAt: string;
  /** UUID tiebreaker. */
  id: string;
}

export function encodeSummaryCursor(
  participantProfileId: string,
  cursor: SummaryCursor,
): string {
  return encode({
    v: SUMMARY_CURSOR_VERSION,
    p: participantProfileId,
    t: cursor.lastMessageAt,
    id: cursor.id,
  });
}

/**
 * Decode a summary cursor, requiring it to belong to `participantProfileId`.
 * Returns null on any malformed / mismatched / tampered cursor.
 */
export function decodeSummaryCursor(
  raw: string | undefined,
  participantProfileId: string,
): SummaryCursor | null {
  if (!raw) return null;
  const p = decodeJson(raw);
  if (!p) return null;
  if (p.v !== SUMMARY_CURSOR_VERSION) return null;
  if (p.p !== participantProfileId) return null; // reuse by another participant
  if (!isValidIsoInstant(p.t)) return null;
  if (!isValidUuid(p.id)) return null;
  return { lastMessageAt: p.t, id: p.id };
}
