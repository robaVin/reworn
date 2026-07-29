'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    logger.error('conversation thread error', { digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-2xl font-bold text-ink">Conversation</h1>
      <div className="mt-8">
        <Alert tone="danger" title="We couldn’t load this conversation">
          Something went wrong. Please try again.
        </Alert>
        <div className="mt-4 flex gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <Button href="/messages" variant="outline">
            Back to inbox
          </Button>
        </div>
      </div>
    </main>
  );
}
