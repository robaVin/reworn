import { getTranslations } from 'next-intl/server';
import { Skeleton } from '@/components/ui/Skeleton';

/** Route-level loading UI for a conversation thread. */
export default async function ThreadLoading() {
  const t = await getTranslations('Messages');
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <Skeleton className="h-9 w-28 rounded-control" />
      <div className="mt-6 border-b border-line pb-6">
        <Skeleton className="h-6 w-40 rounded-control" />
        <Skeleton className="mt-4 h-24 w-full rounded-card" />
      </div>
      <ol role="status" className="mt-8 space-y-3">
        <span className="sr-only">{t('loadingMessages')}</span>
        {Array.from({ length: 4 }, (_, i) => (
          <li
            key={i}
            className={i % 2 ? 'flex justify-end' : 'flex justify-start'}
          >
            <Skeleton className="h-16 w-3/5 rounded-card" />
          </li>
        ))}
      </ol>
    </main>
  );
}
