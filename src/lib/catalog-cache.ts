import 'server-only';

/**
 * Tiny in-process TTL cache for ANONYMOUS public-catalog reads.
 *
 * Why not `unstable_cache`? Next's data cache requires a request-scoped
 * incremental-cache context, so its miss/hit/invalidation cannot be exercised in
 * the test harness — and the caching contract for this project requires proven
 * invalidation. This process-local cache is fully deterministic and testable.
 *
 * Scope & safety:
 *  - Only public, NON-user-specific DTOs are cached here. Authenticated CTA
 *    state, private seller data, and payment/entitlement data are NEVER cached.
 *  - Cached DTOs may embed short-lived signed image URLs. The TTL
 *    ({@link CATALOG_TTL_MS}, 30s) is far below the signed-URL lifetime (1h), so
 *    a cached URL can never be served past its expiry.
 *  - One broad tag ("catalog"): {@link invalidateCatalog} clears everything on
 *    ANY public-listing mutation. Over-invalidation (cold after a change) is the
 *    safe direction — stale public data is never served. The short TTL is a
 *    backstop so even a missed invalidation self-heals within 30s.
 *
 * Deployment note: this helps a long-lived server (the app's measured, session-
 * pooler-friendly deployment). Under horizontal autoscaling it is per-instance;
 * a shared Next data cache (`unstable_cache` + `revalidateTag`) is the
 * serverless-appropriate evolution and can wrap the same read functions.
 */

/** Default catalog cache lifetime (ms). Well below the 1h signed-URL TTL. */
export const CATALOG_TTL_MS = 30_000;

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

/**
 * Return the cached value for `key` if present and unexpired, else run `fn`,
 * store its result for `ttlMs`, and return it. A `now` override keeps tests
 * deterministic without touching the clock.
 */
export async function cachedCatalog<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = CATALOG_TTL_MS,
  now: number = Date.now(),
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

/** Invalidate ALL cached public-catalog reads. Call after any public-listing
 * mutation (publish / edit of public fields / pause / archive / removal /
 * cover-image change). */
export function invalidateCatalog(): void {
  store.clear();
}

/** Test-only: current number of live cache entries. */
export function __catalogCacheSize(): number {
  return store.size;
}
