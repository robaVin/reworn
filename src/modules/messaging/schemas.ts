import { z } from 'zod';

/**
 * Message body validation + normalisation.
 *
 * A stored body is PLAIN TEXT: no HTML is parsed or rendered anywhere, so the
 * body is persisted verbatim (after normalisation) and always escaped at the
 * eventual render layer. Rules (all enforced here AND, as a backstop, by DB
 * CHECK constraints in migration 0013):
 *   - line endings normalised to LF (CRLF / lone CR -> LF),
 *   - surrounding whitespace trimmed (intentional internal newlines preserved),
 *   - empty / whitespace-only rejected,
 *   - unsupported control characters rejected (TAB and LF are the only control
 *     characters allowed),
 *   - length bounded to {@link MAX_MESSAGE_LENGTH} counted in Unicode code
 *     points (so it agrees with Postgres `char_length`).
 */

/** Documented maximum message length, in Unicode code points. */
export const MAX_MESSAGE_LENGTH = 4000;

const TAB = 0x09;
const LF = 0x0a;
const DEL = 0x7f;

/**
 * True when the string contains a control character other than TAB or LF.
 * Checked numerically (no control-character regex literal) so the source stays
 * pure ASCII. CR is out of scope: it is normalised to LF before this runs.
 */
export function hasDisallowedControl(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code === TAB || code === LF) continue;
    if (code < 0x20 || code === DEL) return true;
  }
  return false;
}

/** Normalise line endings and trim surrounding whitespace. Pure + reusable. */
export function normalizeMessageBody(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

/** Code-point length, matching Postgres `char_length` (not UTF-16 units). */
export function codePointLength(value: string): number {
  let n = 0;
  for (const _char of value) {
    void _char;
    n += 1;
  }
  return n;
}

/**
 * Parses a raw body into a normalised, validated message string. Returns a
 * discriminated result so callers can map the reason to an error without
 * exceptions on the hot path.
 */
export function parseMessageBody(
  raw: unknown,
): { ok: true; value: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') return { ok: false, reason: 'not_a_string' };
  const value = normalizeMessageBody(raw);
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (hasDisallowedControl(value)) return { ok: false, reason: 'control_char' };
  if (codePointLength(value) > MAX_MESSAGE_LENGTH)
    return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

/**
 * Zod schema mirroring {@link parseMessageBody} for the action/UI layer (the
 * inbox arrives in a later increment). Output is the normalised body.
 */
export const messageBodySchema = z
  .string()
  .transform(normalizeMessageBody)
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'empty' });
      return;
    }
    if (hasDisallowedControl(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'control_char' });
    }
    if (codePointLength(value) > MAX_MESSAGE_LENGTH) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'too_long' });
    }
  });

/** A listing id supplied by the client when starting a conversation. */
export const startConversationSchema = z.object({
  listingId: z.string().uuid(),
});
