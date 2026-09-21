/**
 * Public delivery-method labels — pure and shared by the PDP and its tests.
 * Galerija never brokers delivery; these strings only describe what the seller
 * offers, and the buyer arranges hand-over directly.
 */
export const DELIVERY_METHOD_LABELS: Record<string, string> = {
  unspecified: 'Arrange delivery directly with the seller',
  shipping: 'Shipping available',
  pickup: 'Collection available',
  both: 'Shipping or collection available',
};

/** Map a stored delivery method to its public label (defaults to unspecified). */
export function deliveryMethodLabel(method: string): string {
  return DELIVERY_METHOD_LABELS[method] ?? DELIVERY_METHOD_LABELS.unspecified!;
}

/** Maximum length of a seller's free-text delivery note (documented). */
export const DELIVERY_NOTE_MAX = 200;

/**
 * True if the string contains a disallowed control character. Tab (0x09),
 * newline (0x0A), and carriage return (0x0D) are permitted so a multi-line note
 * survives; every other C0 control character and DEL (0x7F) is rejected. Pure
 * char-code scan (no regex) so the rule is unambiguous and the source stays
 * ASCII-only.
 */
export function hasDisallowedControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) {
      return true;
    }
  }
  return false;
}
