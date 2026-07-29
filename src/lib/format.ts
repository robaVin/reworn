/**
 * Money display. Amounts are ALWAYS integer minor units + ISO-4217 code
 * (see prisma/schema.prisma money conventions); floats never appear.
 */
export function formatPrice(
  minor: number,
  currency: string,
  locale = 'en',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/**
 * Parse a human major-unit price (e.g. "240", "240.5", "240.50") into an
 * INTEGER of minor units using string arithmetic — never floating point — so a
 * persisted/queried amount is always exact. Returns undefined for blanks or
 * anything that isn't a non-negative amount with at most two decimals.
 */
export function majorToMinor(input: string): number | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(trimmed);
  if (!m) return undefined;
  const whole = m[1]!;
  const frac = (m[2] ?? '').padEnd(2, '0');
  const minor = Number(whole) * 100 + Number(frac);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

/** Minor units back to a plain major-unit string for pre-filling inputs. */
export function minorToMajor(minor: number): string {
  const whole = Math.floor(minor / 100);
  const frac = minor % 100;
  return frac === 0
    ? String(whole)
    : `${whole}.${String(frac).padStart(2, '0')}`;
}
