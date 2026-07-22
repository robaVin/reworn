import { Chip } from '@/components/ui/Chip';
import { ListingGrid } from '@/components/marketplace/ListingGrid';
import {
  BROWSE_CATEGORIES,
  EDITORIAL_SAMPLE_LISTINGS,
} from './editorial-samples';

/**
 * "The edit" — the homepage discovery section.
 *
 * Until the catalog increment connects the real listing service, the grid
 * shows non-interactive EDITORIAL DESIGN SAMPLES (see editorial-samples.ts):
 * no links, no save, no message actions. A visible label marks the sample
 * data source in development builds only.
 */
export function EditSection() {
  const isDev = process.env.NODE_ENV !== 'production';

  return (
    <section
      id="edit"
      aria-labelledby="edit-heading"
      className="mx-auto max-w-shell px-4 sm:px-8 lg:px-10"
    >
      <div className="mb-1 mt-12 flex flex-wrap items-baseline gap-3.5">
        <h2
          id="edit-heading"
          className="font-display text-2xl font-bold text-ink sm:text-[34px]"
        >
          The edit
        </h2>
        {isDev && (
          <span className="rounded-control border border-warning/40 bg-warning/5 px-2.5 py-0.5 text-[11px] font-semibold text-warning">
            Editorial design samples — replaced by real listings in the catalog
            increment
          </span>
        )}
      </div>

      <nav aria-label="Categories" className="my-5 flex flex-wrap gap-2">
        <Chip href="/browse" selected>
          All
        </Chip>
        {BROWSE_CATEGORIES.map((category) => (
          <Chip
            key={category}
            href={`/browse?category=${encodeURIComponent(category)}`}
          >
            {category}
          </Chip>
        ))}
      </nav>

      {/* No hrefFor: sample cards are intentionally non-interactive. */}
      <ListingGrid listings={EDITORIAL_SAMPLE_LISTINGS} />
    </section>
  );
}
