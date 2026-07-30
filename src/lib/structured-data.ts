/**
 * Safe JSON-LD serialization for embedding in an inline `<script
 * type="application/ld+json">`.
 *
 * `JSON.stringify` alone is NOT safe to drop into HTML: a `</script>` sequence
 * (or a lone `<`) inside any string value would terminate the script element
 * and allow markup injection. We escape the HTML-significant characters (`<`,
 * `>`, `&`) and the two JSON-legal line separators (U+2028 / U+2029) to their
 * `uXXXX` backslash forms -- equivalent JSON, but inert in HTML. The result is
 * assigned via `dangerouslySetInnerHTML`, never interpolated into JSX text.
 */
const ESCAPE_CODES = new Set([0x3c, 0x3e, 0x26, 0x2028, 0x2029]); // < > & LS PS
const BACKSLASH = String.fromCharCode(92);

export function safeJsonLdString(data: unknown): string {
  const json = JSON.stringify(data);
  let out = '';
  for (let i = 0; i < json.length; i++) {
    const code = json.charCodeAt(i);
    out += ESCAPE_CODES.has(code)
      ? BACKSLASH + 'u' + code.toString(16).padStart(4, '0')
      : json[i];
  }
  return out;
}
