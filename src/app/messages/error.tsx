'use client';

import { useEffect } from 'react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

/** Inbox error boundary — a recoverable, accessible failure state. */
export default function MessagesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('inbox page error', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Messages
      </h1>
      <div className="mt-8">
        <Alert tone="danger" title="We couldn’t load your messages">
          Something went wrong loading your inbox. Please try again.
        </Alert>
        <div className="mt-4">
          <Button onClick={() => reset()}>Try again</Button>
        </div>
      </div>
    </main>
  );
}
