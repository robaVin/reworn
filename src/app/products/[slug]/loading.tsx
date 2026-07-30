import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Instant, layout-stable PDP shell. Mirrors the real page's structure (square
 * gallery + info column) with reserved dimensions so there is no layout shift
 * when the streamed content replaces it. Hidden from assistive tech: a single
 * polite "Loading product" status is announced instead of the skeleton boxes.
 */
export default function ProductLoading() {
  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <div role="status" className="sr-only">
        Loading product…
      </div>
      <div aria-hidden>
        <Skeleton className="mb-6 h-4 w-52 rounded-control" />
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <Skeleton className="aspect-square w-full rounded-card" />
          <div className="space-y-4">
            <Skeleton className="h-3 w-24 rounded-control" />
            <Skeleton className="h-9 w-3/4 rounded-control" />
            <Skeleton className="h-7 w-32 rounded-control" />
            <div className="grid grid-cols-2 gap-3 pt-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-control" />
              ))}
            </div>
            <Skeleton className="h-28 w-full rounded-card" />
            <Skeleton className="h-11 w-52 rounded-control" />
          </div>
        </div>
      </div>
    </main>
  );
}
