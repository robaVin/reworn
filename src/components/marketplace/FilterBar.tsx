'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { buildBrowseHref } from '@/modules/catalog/browse-url';
import type { BrowseQuery } from '@/modules/catalog/browse-query';
import { LISTING_CONDITIONS, LISTING_GENDERS } from '@/modules/catalog/schemas';
import { majorToMinor, minorToMajor } from '@/lib/format';
import { Button } from '@/components/ui/Button';

/** Common clothing sizes offered as the canonical multi-select filter set. */
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

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
  const t = useTranslations('Browse');
  const tListing = useTranslations('Listing');
  const tCat = useTranslations('Categories');
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
      setPriceErr(t('priceErrorMin'));
      return;
    }
    if (maxText.trim() && mx === undefined) {
      setPriceErr(t('priceErrorMax'));
      return;
    }
    if (mn !== undefined && mx !== undefined && mn > mx) {
      setPriceErr(t('priceErrorRange'));
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
    <section aria-label={t('filters')} aria-busy={pending} className="mb-6">
      {/* Immediate, VISIBLE feedback that a filter is being applied. The
          FilterBar stays mounted (useTransition holds the current results while
          the RSC navigation runs); this pill is the visible pending signal a
          sighted user needs. Also announced politely for assistive tech. */}
      <p
        aria-live="polite"
        className={`mb-3 flex items-center gap-2 text-sm text-muted transition-opacity ${
          pending ? 'opacity-100' : 'pointer-events-none h-0 opacity-0'
        }`}
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-terracotta-strong"
        />
        {pending ? t('updatingResults') : ''}
      </p>

      {/* Search + sort are always visible (top row). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="browse-q"
            className="mb-1 block text-sm font-medium text-ink"
          >
            {t('searchLabel')}
          </label>
          <input
            id="browse-q"
            type="search"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={t('searchPlaceholder')}
            maxLength={100}
            className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
          />
        </div>
        <div>
          <label
            htmlFor="browse-sort"
            className="mb-1 block text-sm font-medium text-ink"
          >
            {t('sortLabel')}
          </label>
          <select
            id="browse-sort"
            value={query.sort}
            onChange={(e) =>
              patch({ sort: e.target.value as BrowseQuery['sort'] })
            }
            className="min-h-11 rounded-control border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="newest">{t('sortNewest')}</option>
            <option value="price_asc">{t('sortPriceAsc')}</option>
            <option value="price_desc">{t('sortPriceDesc')}</option>
            {query.q && <option value="relevance">{t('sortRelevance')}</option>}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="browse-filter-panel"
          className="min-h-11 rounded-control border border-line px-4 text-sm font-semibold text-ink lg:hidden"
        >
          {open ? t('hideFilters') : t('filters')}
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
              {t('categoryLabel')}
            </label>
            <select
              id="browse-category"
              value={query.categorySlug ?? ''}
              onChange={(e) =>
                patch({ categorySlug: e.target.value || undefined })
              }
              className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">{t('allCategories')}</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {tCat.has(c.slug) ? tCat(c.slug) : c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="browse-gender"
              className="mb-1 block text-sm font-medium text-ink"
            >
              {t('departmentLabel')}
            </label>
            <select
              id="browse-gender"
              value={query.gender ?? ''}
              onChange={(e) => patch({ gender: e.target.value || undefined })}
              className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">{t('everyone')}</option>
              {LISTING_GENDERS.map((g) => (
                <option key={g} value={g}>
                  {tListing(`gender.${g}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Size + condition (checkbox groups) */}
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">
              {t('sizeLabel')}
            </legend>
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
              {t('conditionLabel')}
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
                  {tListing(`condition.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Price + location */}
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-ink">
              {t('priceLabel')}
            </legend>
            <div className="flex items-center gap-2">
              <input
                aria-label={t('minPriceAria')}
                inputMode="decimal"
                value={minText}
                onChange={(e) => setMinText(e.target.value)}
                onBlur={applyPrice}
                placeholder={t('minPlaceholder')}
                className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
              />
              <span aria-hidden className="text-muted">
                –
              </span>
              <input
                aria-label={t('maxPriceAria')}
                inputMode="decimal"
                value={maxText}
                onChange={(e) => setMaxText(e.target.value)}
                onBlur={applyPrice}
                placeholder={t('maxPlaceholder')}
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
              {t('locationLabel')}
            </label>
            <input
              id="browse-location"
              value={locText}
              onChange={(e) => setLocText(e.target.value)}
              placeholder={t('locationPlaceholder')}
              maxLength={80}
              className="min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink"
              aria-describedby="browse-location-hint"
            />
            <p id="browse-location-hint" className="mt-1 text-xs text-muted">
              {t('locationHint')}
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
            {t('clearAllFilters')}
          </Button>
        </div>
      )}
    </section>
  );
}
