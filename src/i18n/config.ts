/**
 * Internationalization configuration — pure, client-safe constants.
 *
 * ReWorn ships three UI languages. English is the default and the fallback for
 * any missing message. The selected locale is a UI-presentation concern only:
 * it NEVER changes URLs, currency/business values, or user-generated content
 * (listing titles, messages, usernames, brand names).
 *
 * Locale is resolved per request from the `NEXT_LOCALE` cookie (see
 * ./request.ts); there is no `/[locale]` route segment.
 */

export const LOCALES = ['en', 'sq', 'mk'] as const;
export type Locale = (typeof LOCALES)[number];

/** English is the application default and the missing-message fallback. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Cookie that carries the selected UI locale (per-request, no URL change). */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/**
 * Endonyms shown in the language selector — each language named in itself.
 * The ReWorn brand name is never translated.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sq: 'Shqip',
  mk: 'Македонски',
};

/** BCP-47 tags for `<html lang>` and Intl formatters. */
export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: 'en',
  sq: 'sq',
  mk: 'mk',
};

/** Narrows an arbitrary string to a supported Locale, else the default. */
export function normalizeLocale(value: string | undefined | null): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.includes(value as Locale);
}
