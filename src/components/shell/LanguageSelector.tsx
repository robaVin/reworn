'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LOCALES, LOCALE_LABELS, normalizeLocale } from '@/i18n/config';
import { setLocale } from '@/modules/i18n/locale-actions';

/**
 * Compact, accessible language selector (English / Shqip / Македонски).
 *
 * A native <select> is deliberate: it is keyboard- and screen-reader-accessible
 * and touch-friendly on mobile without bespoke menu code, and it shows the
 * current language as its value. Switching writes the locale (cookie + durable
 * Profile.locale), then does a FULL document reload so the whole app re-renders
 * cleanly in the new language. The hard reload (rather than a soft
 * router.refresh) is deliberate: it guarantees a consistent render even when a
 * previously cached/installed build is in play (PWA / service-worker version
 * skew), which a soft refresh can crash on. The session cookie is untouched, so
 * the user is never logged out. Language names are endonyms, never translated.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const current = normalizeLocale(useLocale());
  const t = useTranslations('LanguageSelector');
  const [pending, startTransition] = useTransition();

  return (
    <label className={className}>
      <span className="sr-only">{t('label')}</span>
      <select
        aria-label={t('change')}
        value={current}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          if (next === current) return;
          startTransition(async () => {
            await setLocale(next);
            // Full reload: always a clean, consistent render in the new locale,
            // immune to any cached/installed-build skew a soft refresh could hit.
            window.location.reload();
          });
        }}
        className="min-h-11 rounded-control border border-line bg-cream px-2 text-sm text-ink"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
