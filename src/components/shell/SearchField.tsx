import { SearchIcon } from './icons';

/**
 * Marketplace search — the prototype's pill `.searchwrap`.
 *
 * A plain GET form (no client JS): submits to /browse with the query in
 * `?q=`, where the browse route renders a truthful state until the catalog
 * increment connects real search. React/Next handle escaping; the query is
 * never injected as HTML anywhere.
 */
export function SearchField({ id = 'site-search' }: { id?: string }) {
  return (
    <search className="min-w-0 flex-1">
      <form
        action="/browse"
        method="get"
        className="flex w-full max-w-[460px] items-center gap-2 rounded-control border border-line bg-surface py-1 pl-4 pr-1 transition-colors focus-within:border-terracotta-strong"
      >
        <label htmlFor={id} className="sr-only">
          Search the marketplace
        </label>
        <input
          id={id}
          name="q"
          type="search"
          placeholder="Search brands, items, styles…"
          autoComplete="off"
          className="h-9 w-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted focus:outline-none max-[480px]:text-[13px]"
        />
        <button
          type="submit"
          aria-label="Search"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-sand hover:text-ink"
        >
          <SearchIcon className="h-4 w-4" />
        </button>
      </form>
    </search>
  );
}
