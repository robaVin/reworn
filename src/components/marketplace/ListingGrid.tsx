import type { ListingCardData } from '@/modules/catalog/types';
import { ListingCard } from './ListingCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { SearchIcon } from '@/components/shell/icons';

/**
 * Listing grid + its loading / empty / error companions.
 * Columns follow the prototype: 4 → 2 → 1 as the viewport narrows.
 */
const gridClasses =
  'grid grid-cols-1 gap-3 min-[381px]:grid-cols-2 min-[381px]:gap-4 lg:grid-cols-4 lg:gap-6';

export function ListingGrid({
  listings,
  hrefFor,
}: {
  listings: ListingCardData[];
  /** Maps a listing to its detail URL; omit for non-interactive samples. */
  hrefFor?: (listing: ListingCardData) => string;
}) {
  return (
    <div className={gridClasses}>
      {listings.map((listing, i) => (
        <div
          key={listing.id}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
        >
          <ListingCard listing={listing} href={hrefFor?.(listing)} />
        </div>
      ))}
    </div>
  );
}

export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" className={gridClasses}>
      <span className="sr-only">Loading listings…</span>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-card border border-line bg-surface"
        >
          <Skeleton className="aspect-listing rounded-none" />
          <div className="space-y-2 p-3.5 pb-4">
            <Skeleton className="h-3 w-1/3 rounded-control" />
            <Skeleton className="h-4 w-2/3 rounded-control" />
            <Skeleton className="h-3 w-1/2 rounded-control" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListingGridEmpty({
  title = 'Nothing here yet',
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState title={title} action={action} icon={<SearchIcon />}>
      {children}
    </EmptyState>
  );
}

export function ListingGridError({ children }: { children?: React.ReactNode }) {
  return (
    <Alert tone="danger" title="We couldn't load listings">
      {children ??
        'Something went wrong on our side. Please try again in a moment.'}
    </Alert>
  );
}
