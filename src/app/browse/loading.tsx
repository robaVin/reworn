import { ListingGridSkeleton } from '@/components/marketplace/ListingGrid';

/**
 * Route-level loading UI — shown on the initial/cold load AND during every
 * server navigation (filter/sort/page change), so results never flash empty.
 */
export default function BrowseLoading() {
  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Browse the edit
      </h1>
      <div className="mt-8">
        <ListingGridSkeleton count={8} />
      </div>
    </main>
  );
}
