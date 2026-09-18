'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, normalizeLocale } from '@/i18n/config';
import { setLocale } from '@/modules/i18n/locale-actions';

/**
 * Compact, accessible language selector (English / Shqip / Македонски).
 *
 * A native <select> is deliberate: it is keyboard- and screen-reader-accessible
 * and touch-friendly on mobile without bespoke menu code, and it shows the
 * current language as its value. Switching writes the locale (cookie + durable
 * Profile.locale) then refreshes the route so the server re-renders in the new
 * language — the user is never logged out and no client state is discarded.
 * Language names are endonyms and are never translated.
 */
export function LanguageSelector({ className }: { className?: string }) {
  const current = normalizeLocale(useLocale());
  const t = useTranslations('LanguageSelector');
  const router = useRouter();
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
            router.refresh();
          });
        }}
        className="min-h-11 rounded-control border border-line bg-surface px-2 text-sm text-ink"
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
