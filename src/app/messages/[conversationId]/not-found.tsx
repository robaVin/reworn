import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Shown for an unknown OR unauthorized conversation (indistinguishable — a third
 * party learns nothing about whether the conversation exists). Inherits the
 * generic noindex metadata from the route's generateMetadata.
 */
export default async function ThreadNotFound() {
  const t = await getTranslations('Messages');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <EmptyState
        title={t('notFoundTitle')}
        action={
          <Button href="/messages" variant="outline">
            {t('backToInbox')}
          </Button>
        }
      >
        {t('notFoundBody')}
      </EmptyState>
    </main>
  );
}
