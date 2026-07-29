'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    logger.error('browse page error', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Browse the edit
      </h1>
      <div className="mt-8 max-w-xl">
        <Alert tone="danger" title="We couldn’t load listings">
          Something went wrong loading the marketplace. Please try again.
        </Alert>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button href="/browse" variant="outline">
            Reset filters
          </Button>
        </div>
      </div>
    </main>
  );
}
