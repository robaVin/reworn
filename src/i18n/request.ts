import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale } from './config';

/**
 * next-intl request configuration.
 *
 * Resolves the active locale per request from the `NEXT_LOCALE` cookie (written
 * by the language selector), falling back to English. Because every route is
 * `force-dynamic`, reading the cookie server-side is free and keeps SSR and
 * hydration in agreement (no English-then-switch flash).
 *
 * Messages are loaded from the per-locale JSON catalogs. English is always
 * merged underneath the active locale so a missing translation falls back to
 * English instead of rendering a raw key.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  const active = (await import(`../../messages/${locale}.json`)).default;
  const fallback =
    locale === DEFAULT_LOCALE
      ? active
      : (await import(`../../messages/${DEFAULT_LOCALE}.json`)).default;

  // Deep-merge English fallback under the active locale (one level of
  // namespaces is enough for our catalog shape).
  const messages: Record<string, unknown> = { ...fallback };
  for (const [ns, values] of Object.entries(active)) {
    messages[ns] = { ...(fallback[ns] ?? {}), ...(values as object) };
  }

  return { locale, messages };
});
