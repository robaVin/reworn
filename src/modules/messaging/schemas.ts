import { z } from 'zod';

/**
 * Message body normalisation + validation.
 *
 * `normalizeMessageBody` is THE single, canonical helper for message bodies:
 * every write path (the service's `sendConversationMessage` and the Zod schema
 * used by the action/UI layer) passes through it, so the rules below can never
 * diverge between paths.
 *
 * Policy (also backstopped by DB CHECK constraints in migration 0013):
 *   - TRIMMING: surrounding whitespace is removed; intentional INTERNAL newlines
 *     are preserved.
 *   - NEWLINE NORMALISATION: CRLF and lone CR are converted to LF, so stored
 *     bodies use a single consistent line ending.
 *   - CONTROL CHARACTERS: rejected. The only control characters allowed are TAB
 *     (U+0009) and LF (U+000A); everything else in the C0 range and DEL is a
 *     `control_char` rejection. (CR never survives normalisation.)
 *   - MAXIMUM LENGTH: {@link MAX_MESSAGE_LENGTH} Unicode CODE POINTS (so it
 *     agrees with Postgres `char_length`, not UTF-16 units). Empty /
 *     whitespace-only bodies are rejected.
 *
 * Bodies are PLAIN TEXT: no HTML is parsed or rendered, so the normalised value
 * is stored verbatim and escaped at the eventual render layer.
 */

/** Documented maximum message length, in Unicode code points. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Reasons a body can be rejected (stable identifiers surfaced to callers). */
export type MessageBodyRejection =
  'not_a_string' | 'empty' | 'control_char' | 'too_long';

export type NormalizedMessageBody =
  { ok: true; value: string } | { ok: false; reason: MessageBodyRejection };

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

/** Code-point length, matching Postgres `char_length` (not UTF-16 units). */
export function codePointLength(value: string): number {
  let n = 0;
  for (const _char of value) {
    void _char;
    n += 1;
  }
  return n;
}

/** Pure normalisation step: CRLF/CR -> LF, then trim surrounding whitespace. */
function applyNormalization(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').trim();
}

/**
 * THE canonical message-body helper. Normalises then validates, returning a
 * discriminated result so callers map the reason to an error without exceptions
 * on the hot path. All message writes MUST go through this.
 */
export function normalizeMessageBody(raw: unknown): NormalizedMessageBody {
  if (typeof raw !== 'string') return { ok: false, reason: 'not_a_string' };
  const value = applyNormalization(raw);
  if (value.length === 0) return { ok: false, reason: 'empty' };
  if (hasDisallowedControl(value)) return { ok: false, reason: 'control_char' };
  if (codePointLength(value) > MAX_MESSAGE_LENGTH)
    return { ok: false, reason: 'too_long' };
  return { ok: true, value };
}

/**
 * Zod schema for the action/UI layer (the inbox arrives in a later increment),
 * delegating to {@link normalizeMessageBody} so there is ONE source of truth.
 * Output is the normalised body.
 */
export const messageBodySchema = z.string().transform((raw, ctx) => {
  const result = normalizeMessageBody(raw);
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason });
    return z.NEVER;
  }
  return result.value;
});

/** A listing id supplied by the client when starting a conversation. */
export const startConversationSchema = z.object({
  listingId: z.string().uuid(),
});
