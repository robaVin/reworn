import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';

/**
 * Galerija wordmark. The brand is shown lowercase, in the Latin script for
 * en/sq (`galerija`) and Cyrillic for mk (`галерија`) — see `Common.brand`.
 * No monogram: the brand is the wordmark alone.
 */
export async function Wordmark({ className }: { className?: string }) {
  const t = await getTranslations('Common');
  return (
    <Link
      href="/"
      className={cn(
        'flex shrink-0 items-center font-display text-2xl font-bold tracking-tight text-ink max-[480px]:text-lg',
        className,
      )}
    >
      {t('brand')}
    </Link>
  );
}
