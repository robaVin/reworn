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
