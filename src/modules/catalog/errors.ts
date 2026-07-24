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

/**
 * Raised when a listing cannot be PUBLISHED because mandatory fields are
 * missing/invalid. Carries per-field errors so the UI can point at the gaps.
 * 422 (Unprocessable Entity): the request was understood but the listing is
 * not yet complete enough to publish.
 */
export class ListingIncompleteError extends Error {
  readonly status = 422 as const;
  constructor(readonly fieldErrors: Record<string, string[]>) {
    super('listing_incomplete');
    this.name = 'ListingIncompleteError';
  }
}
