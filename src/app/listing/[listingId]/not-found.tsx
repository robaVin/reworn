import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Listing not found',
  robots: { index: false, follow: true },
};

/**
 * Shown when a listing id is unknown OR the listing is not public (draft /
 * paused / archived). Deliberately does not reveal which — a non-public listing
 * is indistinguishable from a missing one.
 */
export default async function ListingNotFound() {
  const t = await getTranslations('Listing');
  return (
    <main className="mx-auto max-w-shell px-4 py-16 sm:px-8 lg:px-10">
      <EmptyState
        title={t('listingNotFoundTitle')}
        action={<Button href="/browse">{t('backToBrowse')}</Button>}
      >
        {t('notFoundBody')}
      </EmptyState>
    </main>
  );
}
