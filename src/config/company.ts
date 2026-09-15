/**
 * Single source of truth for the company / legal / support details rendered in
 * the legal documentation pages and the footer.
 *
 * VALUES IN [SQUARE BRACKETS] ARE PLACEHOLDERS — they render literally on the
 * page so gaps are obvious in review. Fill every one in before publishing (see
 * docs/LEGAL-CHECKLIST.md). Confirmed facts (country, jurisdiction, payment
 * gateway, currency) are already set.
 *
 * Nothing here is legal advice. Have the pages that consume these values
 * reviewed by a qualified adviser (North Macedonia consumer + data-protection
 * law, and card-scheme/PCI requirements) before going live.
 */
export const COMPANY = {
  /** Public brand / trading name. */
  tradingName: 'ReWorn',
  /** Registered legal entity that operates ReWorn and holds the CaSys contract. */
  legalName: '[REGISTERED LEGAL ENTITY NAME]',
  /** Registered seat / address. */
  address: '[REGISTERED ADDRESS, North Macedonia]',
  /** Unique company registration number (ЕМБС). */
  companyRegNo: '[COMPANY REGISTRATION NUMBER (EMBS)]',
  /** Tax number (ЕДБ) / VAT number, if registered. */
  taxNo: '[TAX / VAT NUMBER (EDB)]',

  country: 'North Macedonia',
  /** Governing-law phrasing used in the documents. */
  jurisdiction: 'the Republic of North Macedonia',

  /** Public site URL. Keep in sync with NEXT_PUBLIC_APP_URL once the domain is live. */
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://[YOUR-DOMAIN]',

  /** Customer support. */
  supportEmail: '[SUPPORT EMAIL]',
  supportPhone: '[SUPPORT PHONE, e.g. +389 …]',
  supportHours: 'Monday to Friday, 09:00–17:00 (CET)',
  /** Contact for data-protection / privacy requests (may equal supportEmail). */
  privacyEmail: '[PRIVACY / DATA-PROTECTION EMAIL]',

  /** Payment processing. Confirmed: CaSys, charging in MKD. */
  paymentGateway: 'CaSys (Casys AD Skopje)',
  /** The acquiring bank that issued the e-commerce contract via CaSys. */
  acquiringBank: '[ACQUIRING BANK]',
  currency: 'MKD (Macedonian denar)',
  cardBrands: 'Visa, Mastercard and Maestro',

  /** Data-protection supervisory authority (North Macedonia). */
  dpaName:
    'Agency for Personal Data Protection of the Republic of North Macedonia',
  dpaUrl: 'https://azlp.mk',

  /** Shown as "Last updated" on every legal page. Bump when content changes. */
  lastUpdated: '15 September 2026',
} as const;

export type Company = typeof COMPANY;
