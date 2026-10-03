import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/**
 * Galerija wordmark. The brand is shown lowercase, in Cyrillic (`галерија`) in
 * all three locales — see `Common.brand`. No monogram: the brand is the
 * wordmark alone (the Cyrillic г monogram lives only in the app/favicon icon).
 *
 * Uses `useTranslations` (isomorphic) rather than `getTranslations` so it works
 * in BOTH server contexts (site header/footer) and client contexts (the auth
 * pages render it inside a `'use client'` boundary via AuthCard).
 */
export function Wordmark({ className }: { className?: string }) {
  const t = useTranslations('Common');
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
