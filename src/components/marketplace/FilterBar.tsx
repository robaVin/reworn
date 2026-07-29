'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { buildBrowseHref } from '@/modules/catalog/browse-url';
import type { BrowseQuery } from '@/modules/catalog/browse-query';
import { LISTING_CONDITIONS, LISTING_GENDERS } from '@/modules/catalog/schemas';
import { majorToMinor, minorToMajor } from '@/lib/format';
import { Button } from '@/components/ui/Button';

/** Common clothing sizes offered as the canonical multi-select filter set. */
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

const CONDITION_LABELS: Record<(typeof LISTING_CONDITIONS)[number], string> = {
  new: 'New with tags',
  like_new: 'Like new',
  very_good: 'Very good',
  good: 'Good',
  fair: 'Fair',
};
const GENDER_LABELS: Record<(typeof LISTING_GENDERS)[number], string> = {
  women: 'Women',
  men: 'Men',
  kids: 'Kids',
  unisex: 'Unisex',
};

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface CategoryOption {
  slug: string;
  name: string;
}

/**
 * Browse filter controls. The URL query string is the SINGLE source of truth:
 * every control derives its value from `query` (parsed server-side and passed
 * in) and, on change, navigates to a rebuilt URL. Text inputs keep only their
 * transient typed value locally (debounced into the URL) — never a parallel
 * copy of the filter state. Any change drops the pagination cursor.
 */
export function FilterBar({
  query,
  categories,
}: {
  query: BrowseQuery;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false); // mobile disclosure

  const push = (next: BrowseQuery) =>
    startTransition(() => router.push(buildBrowseHref(next)));
  const patch = (changes: Partial<BrowseQuery>) =>
    push({ ...query, ...changes });

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // ---- transient text inputs (search, location), debounced into the URL ----
  const [qText, setQText] = useState(query.q ?? '');
  const [locText, setLocText] = useState(query.location ?? '');
  useEffect(() => setQText(query.q ?? ''), [query.q]);
  useEffect(() => setLocText(query.location ?? ''), [query.location]);

  useEffect(() => {
    const next = collapse(qText) || undefined;
    if (next === (query.q ?? undefined)) return;
    const t = setTimeout(() => {
      // clearing the query invalidates a relevance sort
      const sort = !next && query.sort === 'relevance' ? 'newest' : query.sort;
      patch({ q: next, sort });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  useEffect(() => {
    const next = collapse(locText).toLowerCase() || undefined;
    if (next === (query.location ?? undefined)) return;
    const t = setTimeout(() => patch({ location: next }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locText]);

  // ---- price range (major-unit inputs → integer minor units) ----
  const [minText, setMinText] = useState(
    query.minPrice !== undefined ? minorToMajor(query.minPrice) : '',
  );
  const [maxText, setMaxText] = useState(
    query.maxPrice !== undefined ? minorToMajor(query.maxPrice) : '',
  );
  const [priceErr, setPriceErr] = useState<string | null>(null);
  useEffect(() => {
    setMinText(
      query.minPrice !== undefined ? minorToMajor(query.minPrice) : '',
    );
    setMaxText(
      query.maxPrice !== undefined ? minorToMajor(query.maxPrice) : '',
    );
    setPriceErr(null);
  }, [query.minPrice, query.maxPrice]);

  const applyPrice = () => {
    const mn = minText.trim() ? majorToMinor(minText) : undefined;
    const mx = maxText.trim() ? majorToMinor(maxText) : undefined;
    if (minText.trim() && mn === undefined) {
      setPriceErr('Enter a valid minimum price.');
      return;
    }
    if (maxText.trim() && mx === undefined) {
      setPriceErr('Enter a valid maximum price.');
      return;
    }
    if (mn !== undefined && mx !== undefined && mn > mx) {
      setPriceErr('Minimum price must be less than or equal to maximum.');
      return;
    }
    setPriceErr(null);
    if (
      mn !== (query.minPrice ?? undefined) ||
      mx !== (query.maxPrice ?? undefined)
    ) {
      patch({ minPrice: mn, maxPrice: mx });
    }
  };

  const hasAnyFilter =
    !!query.q ||
    !!query.categorySlug ||
    !!query.gender ||
    !!query.location ||
    query.sizes.length > 0 ||
    query.conditions.length > 0 ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined ||
    query.sort !== (query.q ? 'relevance' : 'newest');

  return (
    <section aria-label="Filters" className="mb-6">
      <p aria-live="polite" className="sr-only">
        {pending ? 'Updating results' : ''}
      </p>

      {/* Search + sort are always visible (top row). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="browse-q"
            className="mb-1 block text-sm font-medium text-ink"
          >
            Search
          </label>
          <input
            id="browse-q"
            type="search"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="Search titles, brands, materials…"
            maxLength={100}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          />
        </div>
        <div>
          <label
            htmlFor="browse-sort"
            className="mb-1 block text-sm font-medium text-ink"
          >
            Sort
          </label>
          <select
            id="browse-sort"
            value={query.sort}
            onChange={(e) =>
              patch({ sort: e.target.value as BrowseQuery['sort'] })
            }
            className="min-h-11 rounded-control border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            {query.q && <option value="relevance">Best match</option>}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="browse-filter-panel"
          className="min-h-11 rounded-control border border-line px-4 text-sm font-semibold text-ink lg:hidden"
        >
          {open ? 'Hide filters' : 'Filters'}
        </button>
      </div>

      <div
        id="browse-filter-panel"
        className={`${open ? 'block' : 'hidden'} mt-4 grid gap-5 lg:grid lg:grid-cols-3`}
      >
        {/* Category + gender */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="browse-category"
              className="mb-1 block text-sm font-medium text-ink"
            >
              Category
            </label>
            <select
              id="browse-category"
              value={query.categorySlug ?? ''}
              onChange={(e) =>
                patch({ categorySlug: e.target.value || undefined })
              }
              className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="browse-gender"
              className="mb-1 block text-sm font-medium text-ink"
            >
              Department
            </label>
            <select
              id="browse-gender"
              value={query.gender ?? ''}
              onChange={(e) => patch({ gender: e.target.value || undefined })}
              className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">Everyone</option>
              {LISTING_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {GENDER_LABELS[g]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Size + condition (checkbox groups) */}
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">Size</legend>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((s) => (
                <label
                  key={s}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-line px-3 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={query.sizes.includes(s)}
                    onChange={() => patch({ sizes: toggle(query.sizes, s) })}
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">
              Condition
            </legend>
            <div className="flex flex-col gap-1.5">
              {LISTING_CONDITIONS.map((c) => (
                <label
                  key={c}
                  className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={query.conditions.includes(c)}
                    onChange={() =>
                      patch({ conditions: toggle(query.conditions, c) })
                    }
                  />
                  {CONDITION_LABELS[c]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Price + location */}
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">Price</legend>
            <div className="flex items-center gap-2">
              <input
                aria-label="Minimum price"
                inputMode="decimal"
                value={minText}
                onChange={(e) => setMinText(e.target.value)}
                onBlur={applyPrice}
                placeholder="Min"
                className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
              />
              <span aria-hidden className="text-muted">
                –
              </span>
              <input
                aria-label="Maximum price"
                inputMode="decimal"
                value={maxText}
                onChange={(e) => setMaxText(e.target.value)}
                onBlur={applyPrice}
                placeholder="Max"
                className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
              />
            </div>
            {priceErr && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {priceErr}
              </p>
            )}
          </fieldset>
          <div>
            <label
              htmlFor="browse-location"
              className="mb-1 block text-sm font-medium text-ink"
            >
              Location
            </label>
            <input
              id="browse-location"
              value={locText}
              onChange={(e) => setLocText(e.target.value)}
              placeholder="e.g. Skopje"
              maxLength={80}
              className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
              aria-describedby="browse-location-hint"
            />
            <p id="browse-location-hint" className="mt-1 text-xs text-muted">
              Exact location match (not radius or fuzzy search).
            </p>
          </div>
        </div>
      </div>

      {hasAnyFilter && (
        <div className="mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => startTransition(() => router.push('/browse'))}
          >
            Clear all filters
          </Button>
        </div>
      )}
    </section>
  );
}
