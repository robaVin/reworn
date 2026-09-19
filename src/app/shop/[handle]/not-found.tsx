import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Seller not found',
  robots: { index: false, follow: true },
};

/** Unknown, malformed, or reserved handles all render the same state. */
export default async function ShopNotFound() {
  const t = await getTranslations('Shop');
  return (
    <main className="mx-auto max-w-shell px-4 py-16 sm:px-8 lg:px-10">
      <EmptyState
        title={t('notFoundTitle')}
        action={<Button href="/browse">{t('browseMarketplace')}</Button>}
      >
        {t('notFoundBody')}
      </EmptyState>
    </main>
  );
}
