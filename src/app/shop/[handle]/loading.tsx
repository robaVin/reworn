import { ListingGridSkeleton } from '@/components/marketplace/ListingGrid';

/**
 * Instant, layout-stable storefront shell. Mirrors the real page (seller header
 * + stats + grid) with reserved dimensions so there is no layout shift when the
 * streamed content replaces it. Hidden from assistive tech behind a single
 * polite "Loading shop" status.
 */
export default function ShopLoading() {
  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <div role="status" className="sr-only">
        Loading shop…
      </div>
      <div aria-hidden>
        <header className="border-b border-line pb-6">
          <div className="h-3 w-16 rounded-control bg-sand" />
          <div className="mt-3 h-9 w-64 rounded-control bg-sand" />
          <div className="mt-2 h-4 w-32 rounded-control bg-sand" />
          <div className="mt-4 flex gap-8">
            <div className="h-4 w-28 rounded-control bg-sand" />
            <div className="h-4 w-36 rounded-control bg-sand" />
          </div>
        </header>
        <div className="mt-8">
          <ListingGridSkeleton count={8} />
        </div>
      </div>
    </main>
  );
}
