import { describe, it, expect } from 'vitest';
import {
  computeReconciliation,
  reconcileListingImages,
} from '@/modules/catalog/image-reconcile';
import type {
  StorageAdapter,
  StorageObjectInfo,
} from '@/modules/catalog/storage';

/**
 * Orphan-reconciliation logic, covered with a fake storage adapter (no DB, no
 * network, no sharp). Proves the safety properties the ops command relies on:
 * detects DB rows missing objects, detects orphan objects, skips recent objects
 * that may still be in flight, and only deletes with the destructive flag.
 */

const NOW = new Date('2026-07-24T12:00:00Z').getTime();
const HOUR = 3_600_000;
const ago = (h: number) => new Date(NOW - h * HOUR);

/** In-memory adapter implementing the reconcile-relevant surface. */
class FakeStorage implements Pick<StorageAdapter, 'list' | 'remove'> {
  constructor(private objects: StorageObjectInfo[]) {}
  removed: string[] = [];
  async list(): Promise<StorageObjectInfo[]> {
    return this.objects;
  }
  async remove(keys: string[]): Promise<void> {
    this.removed.push(...keys);
    this.objects = this.objects.filter((o) => !keys.includes(o.key));
  }
}

describe('computeReconciliation', () => {
  it('flags DB rows whose storage object is missing', () => {
    const report = computeReconciliation({
      dbStorageKeys: ['l1/a.webp', 'l1/b.webp'],
      storageObjects: [{ key: 'l1/a.webp', createdAt: ago(48) }],
      now: NOW,
      minAgeMs: 24 * HOUR,
    });
    expect(report.missingObjects).toEqual(['l1/b.webp']);
    expect(report.orphanObjects).toEqual([]);
  });

  it('flags old orphan objects but skips recent ones', () => {
    const report = computeReconciliation({
      dbStorageKeys: ['l1/keep.webp'],
      storageObjects: [
        { key: 'l1/keep.webp', createdAt: ago(48) },
        { key: 'l1/old-orphan.webp', createdAt: ago(48) },
        { key: 'l1/fresh-orphan.webp', createdAt: ago(1) },
      ],
      now: NOW,
      minAgeMs: 24 * HOUR,
    });
    expect(report.orphanObjects).toEqual(['l1/old-orphan.webp']);
    expect(report.skippedRecent).toEqual(['l1/fresh-orphan.webp']);
    expect(report.missingObjects).toEqual([]);
  });

  it('treats an object with unknown age as old enough (createdAt null)', () => {
    const report = computeReconciliation({
      dbStorageKeys: [],
      storageObjects: [{ key: 'l1/x.webp', createdAt: null }],
      now: NOW,
      minAgeMs: 24 * HOUR,
    });
    expect(report.orphanObjects).toEqual(['l1/x.webp']);
  });
});

describe('reconcileListingImages', () => {
  it('dry-run reports orphans without deleting', async () => {
    const store = new FakeStorage([
      { key: 'l1/orphan.webp', createdAt: ago(48) },
    ]);
    const res = await reconcileListingImages({
      adapter: store,
      dbStorageKeys: [],
      now: NOW,
      minAgeMs: 24 * HOUR,
      del: false,
    });
    expect(res.orphanObjects).toEqual(['l1/orphan.webp']);
    expect(res.deleted).toEqual([]);
    expect(store.removed).toEqual([]);
  });

  it('deletes only old orphans when del=true (never recent, never DB-backed)', async () => {
    const store = new FakeStorage([
      { key: 'l1/keep.webp', createdAt: ago(48) }, // has a DB row
      { key: 'l1/old.webp', createdAt: ago(48) }, // orphan, old → delete
      { key: 'l1/fresh.webp', createdAt: ago(2) }, // orphan, recent → skip
    ]);
    const res = await reconcileListingImages({
      adapter: store,
      dbStorageKeys: ['l1/keep.webp'],
      now: NOW,
      minAgeMs: 24 * HOUR,
      del: true,
    });
    expect(res.deleted).toEqual(['l1/old.webp']);
    expect(store.removed).toEqual(['l1/old.webp']);
    expect(res.skippedRecent).toEqual(['l1/fresh.webp']);
  });
});
