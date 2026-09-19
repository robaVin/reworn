'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/** Conversation-thread error boundary — recoverable, and it never surfaces raw
 * service / Prisma / authorization details (only the opaque digest is logged). */
export default function ThreadError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Messages');

  useEffect(() => {
    logger.error('conversation thread error', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">
        {t('conversationHeading')}
      </h1>
      <div className="mt-8">
        <Alert tone="danger" title={t('threadErrorTitle')}>
          {t('threadErrorBody')}
        </Alert>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => reset()}>{t('tryAgain')}</Button>
          <Button href="/messages" variant="outline">
            {t('backToInbox')}
          </Button>
        </div>
      </div>
    </main>
  );
}
