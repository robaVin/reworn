import { describe, it, expect } from 'vitest';
import {
  DraftController,
  type CreateResult,
  type DraftControllerPorts,
  type UpdateResult,
} from '@/components/seller/draft-controller';

/**
 * Autosave/bootstrap concurrency logic (headless — no DOM). Proves the UX
 * guarantees the increment requires: no draft until the first interaction, a
 * SINGLE idempotent bootstrap even under concurrency, autosave updates the same
 * draft, publish can't race an in-flight save, and retries are clean.
 */

const nextTick = () => new Promise((r) => setTimeout(r, 0));

function harness(opts: { slowUpdate?: boolean } = {}) {
  let current: Record<string, unknown> = {
    title: 'A',
    gender: 'unisex',
    currency: 'MKD',
  };
  const calls = { create: 0, update: 0 };
  let createResult: CreateResult = { ok: true, id: 'listing-1' };
  let updateResult: UpdateResult = { ok: true };
  let liveUpdates = 0;
  let maxLiveUpdates = 0;

  const ports: DraftControllerPorts = {
    createDraft: async () => {
      calls.create += 1;
      await nextTick();
      return createResult;
    },
    updateDraft: async () => {
      calls.update += 1;
      liveUpdates += 1;
      maxLiveUpdates = Math.max(maxLiveUpdates, liveUpdates);
      if (opts.slowUpdate) await nextTick();
      await nextTick();
      liveUpdates -= 1;
      return updateResult;
    },
    buildPayload: () => ({ ...current }),
    bootstrapKey: 'key-1',
    onChange: () => {},
  };

  return {
    ports,
    calls,
    setCurrent: (c: Record<string, unknown>) => {
      current = c;
    },
    setCreateResult: (r: CreateResult) => {
      createResult = r;
    },
    setUpdateResult: (r: UpdateResult) => {
      updateResult = r;
    },
    get maxLiveUpdates() {
      return maxLiveUpdates;
    },
  };
}

describe('DraftController', () => {
  it('creates NO draft on construction (no empty draft if never touched)', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    await nextTick();
    expect(h.calls.create).toBe(0);
    expect(c.listingId).toBeNull();
    expect(c.state).toBe('idle');
  });

  it('first save creates exactly one draft and ends "saved"', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    await c.save();
    expect(h.calls.create).toBe(1);
    expect(c.listingId).toBe('listing-1');
    expect(c.state).toBe('saved');
  });

  it('concurrent ensureDraft calls create only ONE draft', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    const ids = await Promise.all([
      c.ensureDraft(),
      c.ensureDraft(),
      c.ensureDraft(),
    ]);
    expect(h.calls.create).toBe(1);
    expect(new Set(ids)).toEqual(new Set(['listing-1']));
  });

  it('concurrent first saves create only ONE draft', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    await Promise.all([c.save(), c.save(), c.save()]);
    expect(h.calls.create).toBe(1);
  });

  it('bootstrap captures initial fields — no redundant first update', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    await c.save();
    // payload unchanged since create → the snapshot guard skips an update.
    expect(h.calls.update).toBe(0);
  });

  it('autosave updates the SAME draft when fields change', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    await c.save(); // create
    h.setCurrent({ title: 'B', gender: 'unisex', currency: 'MKD' });
    await c.save(); // update
    expect(h.calls.create).toBe(1);
    expect(h.calls.update).toBe(1);
    expect(c.listingId).toBe('listing-1');
  });

  it('serializes saves so two never run at once (publish can await it)', async () => {
    const h = harness({ slowUpdate: true });
    const c = new DraftController(h.ports);
    await c.save(); // create
    h.setCurrent({ title: 'B', gender: 'unisex', currency: 'MKD' });
    const p1 = c.save();
    h.setCurrent({ title: 'C', gender: 'unisex', currency: 'MKD' });
    const p2 = c.save();
    await Promise.all([p1, p2]);
    expect(h.maxLiveUpdates).toBe(1); // never overlapped
  });

  it('surfaces a create failure as "error" and retries cleanly', async () => {
    const h = harness();
    h.setCreateResult({ ok: false, fieldErrors: { title: ['bad'] } });
    const c = new DraftController(h.ports);
    await c.save();
    expect(c.state).toBe('error');
    expect(c.listingId).toBeNull();
    expect(c.fieldErrors.title).toEqual(['bad']);

    // Retry now succeeds — a NEW create attempt is made (bootstrap reset).
    h.setCreateResult({ ok: true, id: 'listing-9' });
    await c.save();
    expect(h.calls.create).toBe(2);
    expect(c.listingId).toBe('listing-9');
    expect(c.state).toBe('saved');
  });

  it('surfaces an update failure as "error"; retry re-saves the same draft', async () => {
    const h = harness();
    const c = new DraftController(h.ports);
    await c.save(); // create
    h.setCurrent({ title: 'B', gender: 'unisex', currency: 'MKD' });
    h.setUpdateResult({ ok: false, fieldErrors: { title: ['nope'] } });
    await c.save();
    expect(c.state).toBe('error');
    expect(c.fieldErrors.title).toEqual(['nope']);

    h.setUpdateResult({ ok: true });
    await c.save();
    expect(c.state).toBe('saved');
    expect(h.calls.create).toBe(1); // still the same draft
    expect(c.listingId).toBe('listing-1');
  });

  it('markUnsaved moves idle → unsaved', () => {
    const h = harness();
    const c = new DraftController(h.ports);
    expect(c.state).toBe('idle');
    c.markUnsaved();
    expect(c.state).toBe('unsaved');
  });
});
