import type { StorageAdapter } from './storage';

/**
 * Listing-image storage reconciliation.
 *
 * Two integrity classes are detected between the `listing_images` table and the
 * object store:
 *   - MISSING objects: a DB row whose storage object is absent (data loss /
 *     failed upload that still committed). Reported only — never auto-deleted,
 *     because destroying a user's listing-image row is more dangerous than a
 *     dangling reference and warrants human attention.
 *   - ORPHAN objects: a stored object with no DB row (e.g. a compensation that
 *     failed to remove the file). These are safe to delete, but only once they
 *     are older than `minAgeMs` so an upload still in flight (object written,
 *     row not yet committed) is never removed.
 *
 * The core is a pure function over plain inputs so it is fully unit-testable
 * with the fake storage adapter and without a database.
 */

export interface ReconcileInput {
  /** Storage keys currently referenced by `listing_images` rows. */
  dbStorageKeys: Iterable<string>;
  /** All objects present in storage (key + creation time). */
  storageObjects: Iterable<{ key: string; createdAt: Date | null }>;
  /** Reference "now" in epoch ms. */
  now: number;
  /** Minimum object age (ms) before an orphan is eligible for deletion. */
  minAgeMs: number;
}

export interface ReconcileReport {
  dbRows: number;
  scannedObjects: number;
  /** DB rows whose object is missing from storage. */
  missingObjects: string[];
  /** Orphan objects old enough to delete. */
  orphanObjects: string[];
  /** Orphan candidates skipped because they are too recent (maybe in flight). */
  skippedRecent: string[];
}

/** Computes the reconciliation report (pure; no I/O). */
export function computeReconciliation(input: ReconcileInput): ReconcileReport {
  const dbKeys = new Set(input.dbStorageKeys);
  const objects = [...input.storageObjects];
  const objectKeys = new Set(objects.map((o) => o.key));

  const missingObjects: string[] = [];
  for (const key of dbKeys) {
    if (!objectKeys.has(key)) missingObjects.push(key);
  }

  const orphanObjects: string[] = [];
  const skippedRecent: string[] = [];
  for (const obj of objects) {
    if (dbKeys.has(obj.key)) continue;
    const ageMs = obj.createdAt
      ? input.now - obj.createdAt.getTime()
      : Infinity;
    if (ageMs >= input.minAgeMs) orphanObjects.push(obj.key);
    else skippedRecent.push(obj.key);
  }

  return {
    dbRows: dbKeys.size,
    scannedObjects: objects.length,
    missingObjects: missingObjects.sort(),
    orphanObjects: orphanObjects.sort(),
    skippedRecent: skippedRecent.sort(),
  };
}

export interface ReconcileRunResult extends ReconcileReport {
  deleted: string[];
}

/**
 * Enumerates storage + DB keys, computes the report, and (only when
 * `del === true`) removes the orphan objects. Returns everything it found.
 */
export async function reconcileListingImages(opts: {
  adapter: Pick<StorageAdapter, 'list' | 'remove'>;
  dbStorageKeys: Iterable<string>;
  now: number;
  minAgeMs: number;
  del: boolean;
}): Promise<ReconcileRunResult> {
  const storageObjects = await opts.adapter.list();
  const report = computeReconciliation({
    dbStorageKeys: opts.dbStorageKeys,
    storageObjects,
    now: opts.now,
    minAgeMs: opts.minAgeMs,
  });

  let deleted: string[] = [];
  if (opts.del && report.orphanObjects.length > 0) {
    await opts.adapter.remove(report.orphanObjects);
    deleted = report.orphanObjects;
  }

  return { ...report, deleted };
}
