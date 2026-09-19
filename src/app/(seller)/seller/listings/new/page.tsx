import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { env } from '@/lib/env';
import { requireAnyRolePage } from '@/modules/auth/page-guards';
import {
  resolveSellerForUser,
  listActiveCategories,
} from '@/modules/catalog/listing-service';
import { CreateListingForm } from '@/components/seller/CreateListingForm';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Sell');
  return { title: t('meta.newListingTitle') };
}
export const dynamic = 'force-dynamic';

export default async function NewListingPage() {
  // Server-side role enforcement (seller or admin). Buyers get notFound().
  const ctx = await requireAnyRolePage(
    ['seller', 'admin'],
    '/seller/listings/new',
  );

  const seller = await resolveSellerForUser(ctx.userId);
  const categories =
    seller && seller.status === 'active' ? await listActiveCategories() : [];
  const t = await getTranslations('Sell');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        {t('sellerStudio')}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        {t('newListing.heading')}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        {t('newListing.intro')}
      </p>

      <div className="mt-8">
        {!seller ? (
          <SellerProfileRequired />
        ) : seller.status !== 'active' ? (
          <SellerNotActive status={seller.status} />
        ) : (
          <>
            <EntitlementNotice enforced={env.SUBSCRIPTION_ENFORCEMENT} />
            <div className="mt-6">
              <CreateListingForm categories={categories} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

async function SellerProfileRequired() {
  const t = await getTranslations('Sell');
  return (
    <Alert tone="info" title={t('newListing.profileRequiredTitle')}>
      {t('newListing.profileRequiredBody')}
      <code className="mt-2 block rounded-lg bg-sand px-3 py-2 text-xs text-ink">
        npm run dev:seller:provision -- --email you@example.com
      </code>
    </Alert>
  );
}

async function SellerNotActive({ status }: { status: string }) {
  const t = await getTranslations('Sell');
  return (
    <Alert tone="warning" title={t('notActive.title')}>
      {t.rich('notActive.body', {
        status,
        strong: (chunks) => <strong>{chunks}</strong>,
      })}
      <div className="mt-3">
        <Button href="/seller" variant="outline" size="sm">
          {t('newListing.backToSeller')}
        </Button>
      </div>
    </Alert>
  );
}

async function EntitlementNotice({ enforced }: { enforced: boolean }) {
  const t = await getTranslations('Sell');
  if (!enforced) {
    return (
      <Alert tone="info" title={t('entitlement.devTitle')}>
        {t.rich('entitlement.devBody', {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </Alert>
    );
  }
  return (
    <Alert tone="info" title={t('entitlement.subTitle')}>
      {t('entitlement.subBody')}
    </Alert>
  );
}
