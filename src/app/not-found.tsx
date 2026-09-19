import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';

/**
 * 404 — also shown when a guard hides a protected area (403 → notFound()),
 * so the copy deliberately does not distinguish the two cases.
 */
export default async function NotFound() {
  const t = await getTranslations('System');
  return (
    <main className="mx-auto flex max-w-shell flex-col items-center px-4 py-24 text-center sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        404
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">
        {t('notFoundTitle')}
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
        {t('notFoundBody')}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/">{t('backHome')}</Button>
        <Button href="/browse" variant="outline">
          {t('browse')}
        </Button>
      </div>
    </main>
  );
}
