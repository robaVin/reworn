import { describe, it, expect, beforeEach } from 'vitest';
import {
  cachedCatalog,
  invalidateCatalog,
  __catalogCacheSize,
  CATALOG_TTL_MS,
} from '@/lib/catalog-cache';

describe('cachedCatalog', () => {
  beforeEach(() => invalidateCatalog());

  it('MISS executes the loader; HIT within TTL skips it', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return { n: calls };
    };
    const a = await cachedCatalog('k', load, 1000, 0);
    const b = await cachedCatalog('k', load, 1000, 500); // within TTL
    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 }); // same cached value, loader not re-run
    expect(calls).toBe(1);
  });

  it('re-executes after the entry expires', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      return calls;
    };
    await cachedCatalog('k', load, 1000, 0);
    const later = await cachedCatalog('k', load, 1000, 1001); // past TTL
    expect(later).toBe(2);
    expect(calls).toBe(2);
  });

  it('keys are independent', async () => {
    await cachedCatalog('a', async () => 1, 1000, 0);
    await cachedCatalog('b', async () => 2, 1000, 0);
    expect(__catalogCacheSize()).toBe(2);
  });

  it('invalidateCatalog clears everything (next read is a MISS)', async () => {
    let calls = 0;
    const load = async () => ++calls;
    await cachedCatalog('k', load, 1000, 0);
    expect(__catalogCacheSize()).toBe(1);
    invalidateCatalog();
    expect(__catalogCacheSize()).toBe(0);
    const after = await cachedCatalog('k', load, 1000, 100);
    expect(after).toBe(2); // re-executed
  });

  it('default TTL is well below the 1h signed-URL lifetime', () => {
    expect(CATALOG_TTL_MS).toBeLessThan(3600_000);
  });
});
