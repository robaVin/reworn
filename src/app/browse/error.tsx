'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/** Browse error boundary — a recoverable, accessible failure state. */
export default function BrowseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Browse');
  useEffect(() => {
    logger.error('browse page error', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('heading')}
      </h1>
      <div className="mt-8 max-w-xl">
        <Alert tone="danger" title={t('errorTitle')}>
          {t('errorBody')}
        </Alert>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => reset()}>{t('tryAgain')}</Button>
          <Button href="/browse" variant="outline">
            {t('resetFilters')}
          </Button>
        </div>
      </div>
    </main>
  );
}
