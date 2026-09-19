'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

/**
 * Route error boundary. Shows a safe, generic message — never the raw
 * error, stack trace or any internal identifiers. `reset()` re-renders the
 * failed segment.
 */
export default function RouteError({ reset }: { reset: () => void }) {
  const t = useTranslations('System');
  return (
    <main className="mx-auto flex max-w-shell flex-col items-center px-4 py-24 text-center sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        {t('errorEyebrow')}
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">
        {t('errorTitle')}
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
        {t('errorBody')}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>{t('tryAgain')}</Button>
        <Button href="/" variant="outline">
          {t('backHome')}
        </Button>
      </div>
    </main>
  );
}
