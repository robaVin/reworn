import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { getPublicListingBySlug } from '@/modules/catalog/public-catalog';
import { getAuthContext } from '@/modules/auth/session';
import { getSavedListingIds } from '@/modules/saved/service';
import { resolveMessageCtaState } from '@/modules/messaging/conversation-actions';
import { env } from '@/lib/env';
import { ProductDetail } from '@/components/marketplace/ProductDetail';
import { SaveButton } from '@/components/marketplace/SaveButton';
import { MessageSellerCta } from '@/components/marketplace/MessageSellerCta';
import {
  RelatedProducts,
  RelatedProductsSkeleton,
} from '@/components/marketplace/RelatedProducts';

export const dynamic = 'force-dynamic';

function canonicalPath(slug: string): string {
  return `/products/${slug}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getPublicListingBySlug(slug);
  if (!listing) {
    const t = await getTranslations('Listing');
    return { title: t('metaNotFound'), robots: { index: false } };
  }

  const path = canonicalPath(listing.slug ?? slug);
  const description = (
    listing.description ?? `${listing.brand ?? ''} ${listing.title}`.trim()
  ).slice(0, 160);
  const images = listing.coverUrl ? [{ url: listing.coverUrl }] : [];

  return {
    title: listing.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: listing.title,
      description,
      type: 'website',
      url: path,
      images,
    },
    twitter: {
      card: images.length ? 'summary_large_image' : 'summary',
      title: listing.title,
      description,
      images: images.map((i) => i.url),
    },
    robots: { index: true, follow: true },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // The ONLY dependency of the primary content. `loading.tsx` streams a shell
  // instantly while this resolves; the CTA and related products each stream in
  // their own Suspense boundary and never block this render.
  const listing = await getPublicListingBySlug(slug);
  if (!listing) notFound();

  const path = canonicalPath(listing.slug ?? slug);
  const absoluteUrl = new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

  // Save (wishlist) heart — only on an available (published) listing; a sold
  // listing offers no save/availability action. Saved-state is one bounded
  // lookup for this single listing; anonymous viewers make no query.
  let saveControl: React.ReactNode = undefined;
  if (listing.status === 'published') {
    const auth = await getAuthContext();
    const saved = auth
      ? (await getSavedListingIds(auth.userId, [listing.id])).has(listing.id)
      : false;
    saveControl = (
      <SaveButton
        listingId={listing.id}
        initialSaved={saved}
        authenticated={!!auth}
        returnPath={path}
      />
    );
  }

  return (
    <ProductDetail
      listing={listing}
      canonicalPath={path}
      absoluteUrl={absoluteUrl}
      saveControl={saveControl}
      cta={
        listing.status === 'sold' ? (
          <SoldNote />
        ) : (
          <Suspense fallback={<CtaSkeleton />}>
            <SellerMessageCta listingId={listing.id} returnPath={path} />
          </Suspense>
        )
      }
      related={
        <Suspense fallback={<RelatedProductsSkeleton />}>
          <RelatedProducts
            query={{
              listingId: listing.id,
              brand: listing.brand,
              categorySlug: listing.categorySlug,
              size: listing.size,
              priceMinor: listing.priceMinor,
            }}
          />
        </Suspense>
      }
    />
  );
}

/**
 * The auth-dependent "Message seller" control. Isolated in its own Suspense
 * boundary so the auth + CTA-state lookup never delays the primary product
 * content. It runs ONLY after the listing has been proven public (it is a child
 * of the already-resolved page). No ids are rendered except the listing's own id
 * in the reused messaging-form boundary.
 */
async function SellerMessageCta({
  listingId,
  returnPath,
}: {
  listingId: string;
  returnPath: string;
}) {
  const auth = await getAuthContext();
  const state = await resolveMessageCtaState(auth?.userId ?? null, listingId);
  return (
    <MessageSellerCta
      listingId={listingId}
      state={state}
      returnPath={returnPath}
    />
  );
}

function CtaSkeleton() {
  return (
    <div
      aria-hidden
      className="mt-2 h-11 w-full rounded-control bg-sand sm:w-52"
    />
  );
}

/**
 * Shown in place of the "Message seller" control on a SOLD listing. The item is
 * no longer available, so no availability/contact action is offered; existing
 * conversations remain reachable from /messages.
 */
async function SoldNote() {
  const t = await getTranslations('Listing');
  return (
    <p className="mt-3 rounded-control border border-line bg-sand/60 px-3 py-2 text-sm text-muted">
      {t('soldNote')}
    </p>
  );
}
