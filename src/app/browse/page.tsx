import type { Metadata } from 'next';
import { Chip } from '@/components/ui/Chip';
import { Button } from '@/components/ui/Button';
import { ListingGridEmpty } from '@/components/marketplace/ListingGrid';
import { BROWSE_CATEGORIES } from '@/components/home/editorial-samples';

export const metadata: Metadata = { title: 'Browse the edit' };

/**
 * Browse — TRUTHFUL PLACEHOLDER until the catalog increment.
 *
 * The header search and category chips land here so navigation is never
 * broken. The query is acknowledged (React-escaped, never injected as HTML)
 * and no fake results are rendered. Real search/filtering connects to the
 * listing service in its scheduled increment.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.trim() : '';
  const category = typeof params.category === 'string' ? params.category : '';
  const knownCategory = (BROWSE_CATEGORIES as readonly string[]).includes(
    category,
  )
    ? category
    : null;

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
        Browse the edit
      </h1>

      <nav aria-label="Categories" className="my-6 flex flex-wrap gap-2">
        <Chip href="/browse" selected={!knownCategory}>
          All
        </Chip>
        {BROWSE_CATEGORIES.map((c) => (
          <Chip
            key={c}
            href={`/browse?category=${encodeURIComponent(c)}`}
            selected={knownCategory === c}
          >
            {c}
          </Chip>
        ))}
      </nav>

      <ListingGridEmpty
        title={
          query
            ? `No results for “${query}” yet`
            : knownCategory
              ? `No ${knownCategory.toLowerCase()} yet`
              : 'The catalogue is on its way'
        }
        action={
          <Button href="/" variant="outline">
            Back to the homepage
          </Button>
        }
      >
        Listings, search and filters arrive with the catalogue increment.
        Nothing is live for browsing yet — check back soon.
      </ListingGridEmpty>
    </main>
  );
}
