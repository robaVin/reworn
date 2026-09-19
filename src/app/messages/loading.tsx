import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Route-level loading UI for the inbox — shown on cold load and during every
 * pagination navigation, so the list never flashes empty.
 */
export default async function MessagesLoading() {
  const t = await getTranslations('Messages');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('inboxTitle')}
      </h1>
      <ul role="status" className="mt-8 space-y-3">
        <span className="sr-only">{t('loadingConversations')}</span>
        {Array.from({ length: 5 }, (_, i) => (
          <li
            key={i}
            className="flex gap-4 rounded-card border border-line bg-surface p-4"
          >
            <Skeleton className="h-16 w-16 shrink-0 rounded-control" />
            <div className="flex-1 space-y-2 py-1">
              <Skeleton className="h-4 w-1/3 rounded-control" />
              <Skeleton className="h-3 w-1/2 rounded-control" />
              <Skeleton className="h-3 w-2/3 rounded-control" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
