import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requireUserPage } from '@/modules/auth/page-guards';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { listSavedForUser } from '@/modules/saved/service';
import { AuthNotConfigured } from '@/components/shell/AuthNotConfigured';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { HeartIcon } from '@/components/shell/icons';
import { ListingGrid } from '@/components/marketplace/ListingGrid';
import { productHref } from '@/components/marketplace/listing-card-data';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Favorites');
  return { title: t('title') };
}
export const dynamic = 'force-dynamic';

/**
 * Saved items — the authenticated user's real wishlist. Only the publicly
 * viewable saved listings are shown (published or sold, reusing the public
 * visibility contract); a saved listing that is currently draft/paused/archived
 * keeps its relation but never appears here, and reappears if it is republished.
 * Sold saved listings render with a prominent SOLD state. Fail-closed without
 * Supabase, like the other guarded routes.
 */
export default async function SavedItemsPage() {
  if (!isSupabaseConfigured()) return <AuthNotConfigured />;
  const ctx = await requireUserPage('/saved');
  const [items, t] = await Promise.all([
    listSavedForUser(ctx.userId),
    getTranslations('Favorites'),
  ]);

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('title')}
      </h1>

      {items.length === 0 ? (
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
      ) : (
        <div className="mt-8">
          {/* Every item here is saved by definition, so all hearts start filled
              (and can be toggled to unsave). Sold items carry the SOLD badge. */}
          <ListingGrid
            listings={items}
            hrefFor={productHref}
            savedIds={new Set(items.map((i) => i.id))}
            authenticated
          />
        </div>
      )}
    </main>
  );
}
