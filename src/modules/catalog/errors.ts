/**
 * Catalog-domain errors. Kept separate from auth errors: authorization failures
 * (401/403/404) use AuthorizationError; a state conflict (e.g. editing a listing
 * that is not in an editable state) is a 409 and uses this.
 */
export class ListingConflictError extends Error {
  readonly status = 409 as const;
  constructor(readonly reason: string) {
    super(`listing_conflict:${reason}`);
    this.name = 'ListingConflictError';
  }
}
