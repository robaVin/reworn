'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { buildBrowseHref } from '@/modules/catalog/browse-url';
import type { BrowseQuery } from '@/modules/catalog/browse-query';
import { LISTING_CONDITIONS, LISTING_GENDERS } from '@/modules/catalog/schemas';
import { majorToMinor, minorToMajor } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { CloseIcon } from '@/components/shell/icons';

/** Common clothing sizes offered as the canonical multi-select filter set. */
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

const selectClass =
  'min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-terracotta-strong focus:outline-none';
const textInputClass =
  'min-h-11 w-full rounded-control border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-terracotta-strong focus:outline-none';
const legendClass = 'mb-1.5 text-sm font-medium text-ink';
const labelClass = 'mb-1 block text-sm font-medium text-ink';

/**
 * A size/condition filter option presented as a compact pill while remaining a
 * real, accessible native checkbox: the input is visually hidden (`sr-only`)
 * but still focusable and announced by assistive tech; the styled sibling span
 * reflects `:checked`/focus via Tailwind `peer-*`. Selection is conveyed by the
 * native checked state, not colour alone.
 */
function FilterChip({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-block cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span className="inline-flex min-h-9 items-center rounded-control border border-line px-3.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-terracotta-strong hover:text-ink peer-checked:border-terracotta-strong peer-checked:bg-terracotta-strong peer-checked:text-cream peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-terracotta-strong">
        {label}
      </span>
    </label>
  );
}

export interface CategoryOption {
  slug: string;
  name: string;
}

interface ActiveChip {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * Browse filter controls. The URL query string is the SINGLE source of truth:
 * every control derives its value from `query` (parsed server-side and passed
 * in) and, on change, navigates to a rebuilt URL. Text inputs keep only their
 * transient typed value locally (debounced into the URL) — never a parallel
 * copy of the filter state. Any change drops the pagination cursor.
 *
 * Presentation: search + sort share the primary row; the remaining filters live
 * in a cohesive panel (inline on desktop, in an accessible drawer on mobile —
 * the shared native-<dialog> primitive). Size/condition render as chips over
 * native checkboxes, so the URL/query semantics are entirely unchanged.
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
  const [open, setOpen] = useState(false); // mobile drawer

  const push = (next: BrowseQuery) =>
    startTransition(() => router.push(buildBrowseHref(next)));
  const patch = (changes: Partial<BrowseQuery>) =>
    push({ ...query, ...changes });

  const toggle = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // Close the mobile drawer once the viewport reaches the desktop breakpoint,
  // so an open dialog can never linger (and trap focus) after its trigger hides.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  const clearAll = () => startTransition(() => router.push('/browse'));

  // Active, individually-removable filters, derived straight from the query
  // (no fabricated state). Search stays in its own visible input, so it is not
  // duplicated here; sort is an ordering, not a filter.
  const categoryName = (slug: string) => {
    const c = categories.find((x) => x.slug === slug);
    if (!c) return slug;
    return tCat.has(c.slug) ? tCat(c.slug) : c.name;
  };
  const priceChipLabel = () => {
    const lo = query.minPrice !== undefined ? minorToMajor(query.minPrice) : '';
    const hi = query.maxPrice !== undefined ? minorToMajor(query.maxPrice) : '';
    const range = lo && hi ? `${lo}–${hi}` : lo ? `${lo}+` : hi ? `≤${hi}` : '';
    return `${t('priceLabel')}: ${range}`;
  };
  const activeChips: ActiveChip[] = [
    ...(query.categorySlug
      ? [
          {
            key: 'category',
            label: categoryName(query.categorySlug),
            onRemove: () => patch({ categorySlug: undefined }),
          },
        ]
      : []),
    ...(query.gender
      ? [
          {
            key: 'gender',
            label: tListing(`gender.${query.gender}`),
            onRemove: () => patch({ gender: undefined }),
          },
        ]
      : []),
    ...query.sizes.map((s) => ({
      key: `size-${s}`,
      label: s,
      onRemove: () => patch({ sizes: query.sizes.filter((x) => x !== s) }),
    })),
    ...query.conditions.map((c) => ({
      key: `cond-${c}`,
      label: tListing(`condition.${c}`),
      onRemove: () =>
        patch({ conditions: query.conditions.filter((x) => x !== c) }),
    })),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? [
          {
            key: 'price',
            label: priceChipLabel(),
            onRemove: () => patch({ minPrice: undefined, maxPrice: undefined }),
          },
        ]
      : []),
    ...(query.location
      ? [
          {
            key: 'location',
            label: query.location,
            onRemove: () => patch({ location: undefined }),
          },
        ]
      : []),
  ];

  // The secondary controls, shared between the desktop panel and the mobile
  // drawer. `p` namespaces element ids so the two instances never collide;
  // `stacked` switches between the desktop grid and the drawer's single column.
  const controls = (p: string, stacked: boolean) => {
    const category = (
      <div key="category">
        <label htmlFor={`${p}-category`} className={labelClass}>
          {t('categoryLabel')}
        </label>
        <select
          id={`${p}-category`}
          value={query.categorySlug ?? ''}
          onChange={(e) => patch({ categorySlug: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">{t('allCategories')}</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {tCat.has(c.slug) ? tCat(c.slug) : c.name}
            </option>
          ))}
        </select>
      </div>
    );

    const department = (
      <div key="department">
        <label htmlFor={`${p}-gender`} className={labelClass}>
          {t('departmentLabel')}
        </label>
        <select
          id={`${p}-gender`}
          value={query.gender ?? ''}
          onChange={(e) => patch({ gender: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">{t('everyone')}</option>
          {LISTING_GENDERS.map((g) => (
            <option key={g} value={g}>
              {tListing(`gender.${g}`)}
            </option>
          ))}
        </select>
      </div>
    );

    const price = (
      <fieldset key="price">
        <legend className={legendClass}>{t('priceLabel')}</legend>
        <div className="flex items-center gap-2">
          <input
            aria-label={t('minPriceAria')}
            inputMode="decimal"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            onBlur={applyPrice}
            placeholder={t('minPlaceholder')}
            className="min-h-11 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-terracotta-strong focus:outline-none"
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
            className="min-h-11 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-sm text-ink transition-colors focus:border-terracotta-strong focus:outline-none"
          />
        </div>
        {priceErr && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {priceErr}
          </p>
        )}
      </fieldset>
    );

    const location = (
      <div key="location">
        <label htmlFor={`${p}-location`} className={labelClass}>
          {t('locationLabel')}
        </label>
        <input
          id={`${p}-location`}
          value={locText}
          onChange={(e) => setLocText(e.target.value)}
          placeholder={t('locationPlaceholder')}
          maxLength={80}
          className={textInputClass}
          aria-describedby={`${p}-location-hint`}
        />
        <p id={`${p}-location-hint`} className="mt-1 text-xs text-muted">
          {t('locationHint')}
        </p>
      </div>
    );

    const size = (
      <fieldset key="size">
        <legend className={legendClass}>{t('sizeLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {SIZE_OPTIONS.map((s) => (
            <FilterChip
              key={s}
              label={s}
              checked={query.sizes.includes(s)}
              onChange={() => patch({ sizes: toggle(query.sizes, s) })}
            />
          ))}
        </div>
      </fieldset>
    );

    const condition = (
      <fieldset key="condition">
        <legend className={legendClass}>{t('conditionLabel')}</legend>
        <div className="flex flex-wrap gap-2">
          {LISTING_CONDITIONS.map((c) => (
            <FilterChip
              key={c}
              label={tListing(`condition.${c}`)}
              checked={query.conditions.includes(c)}
              onChange={() =>
                patch({ conditions: toggle(query.conditions, c) })
              }
            />
          ))}
        </div>
      </fieldset>
    );

    if (stacked) {
      return (
        <div className="space-y-5">
          {category}
          {department}
          {size}
          {condition}
          {price}
          {location}
        </div>
      );
    }
    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {category}
          {department}
          {price}
          {location}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {size}
          {condition}
        </div>
      </>
    );
  };

  return (
    <section
      aria-label={t('filters')}
      aria-busy={pending}
      className="mb-6 mt-4"
    >
      {/* Immediate, VISIBLE feedback that a filter is being applied. The
          FilterBar stays mounted (useTransition holds the current results while
          the RSC navigation runs); this pill is the visible pending signal a
          sighted user needs. Also announced politely for assistive tech. */}
      <p
        aria-live="polite"
        className={`mb-2 flex items-center gap-2 text-sm text-muted transition-opacity ${
          pending ? 'opacity-100' : 'pointer-events-none h-0 opacity-0'
        }`}
      >
        <span
          aria-hidden
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-terracotta-strong"
        />
        {pending ? t('updatingResults') : ''}
      </p>

      {/* Primary row: search + sort (+ the mobile Filters trigger). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="browse-q" className={labelClass}>
            {t('searchLabel')}
          </label>
          <input
            id="browse-q"
            type="search"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={t('searchPlaceholder')}
            maxLength={100}
            className={textInputClass}
          />
        </div>
        <div className="sm:w-52">
          <label htmlFor="browse-sort" className={labelClass}>
            {t('sortLabel')}
          </label>
          <select
            id="browse-sort"
            value={query.sort}
            onChange={(e) =>
              patch({ sort: e.target.value as BrowseQuery['sort'] })
            }
            className={selectClass}
          >
            <option value="newest">{t('sortNewest')}</option>
            <option value="price_asc">{t('sortPriceAsc')}</option>
            <option value="price_desc">{t('sortPriceDesc')}</option>
            {query.q && <option value="relevance">{t('sortRelevance')}</option>}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="relative inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-line px-4 text-sm font-semibold text-ink transition-colors hover:border-terracotta-strong lg:hidden"
        >
          {t('filters')}
          {hasAnyFilter && (
            <span
              aria-hidden
              className="h-2 w-2 rounded-full bg-terracotta-strong"
            />
          )}
        </button>
      </div>

      {/* Desktop: cohesive secondary filter panel (inline). */}
      <div className="mt-4 hidden rounded-card border border-line bg-surface p-4 shadow-soft lg:block">
        {controls('d', false)}
      </div>

      {/* Active-filter summary — removable chips + clear-all, all viewports. */}
      {activeChips.length > 0 && (
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          aria-label={t('activeFilters')}
        >
          {activeChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1 rounded-control border border-line bg-surface py-1 pl-3 pr-1 text-[13px] text-ink"
            >
              {chip.label}
              <button
                type="button"
                onClick={chip.onRemove}
                aria-label={t('removeFilter', { label: chip.label })}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
              >
                <span aria-hidden className="text-base leading-none">
                  ×
                </span>
              </button>
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {t('clearAllFilters')}
          </Button>
        </div>
      )}

      {/* Mobile: the same controls in an accessible drawer (shared primitive). */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        label={t('filters')}
        variant="drawer"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="font-display text-lg font-bold">{t('filters')}</p>
          <IconButton label={t('hideFilters')} onClick={() => setOpen(false)}>
            <CloseIcon />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {controls('m', true)}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <Button variant="ghost" size="sm" onClick={clearAll}>
            {t('clearAllFilters')}
          </Button>
          <Button size="sm" onClick={() => setOpen(false)}>
            {t('showResults')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
