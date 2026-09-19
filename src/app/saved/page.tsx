import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requireUserPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { HeartIcon } from '@/components/shell/icons';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Favorites');
  return { title: t('title') };
}
export const dynamic = 'force-dynamic';

/**
 * Saved items — real guarded route (any authenticated user), truthful
 * not-yet-connected state until the saved-items domain ships with the
 * catalog increment. Fail-closed configuration state without Supabase.
 */
export default async function SavedItemsPage() {
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  await requireUserPage('/saved');
  const t = await getTranslations('Favorites');

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('title')}
      </h1>
      <div className="mt-6">
        <EmptyState
          icon={<HeartIcon />}
          title={t('emptyTitle')}
          action={
            <Button href="/browse" variant="outline">
              {t('browse')}
            </Button>
          }
        >
          {t('emptyBody')}
        </EmptyState>
      </div>
    </main>
  );
}
