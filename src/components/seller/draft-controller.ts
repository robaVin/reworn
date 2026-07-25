/**
 * Headless autosave/draft-bootstrap controller for the listing form.
 *
 * Framework-agnostic on purpose: all the tricky concurrency lives here (single
 * idempotent bootstrap, serialized saves, publish-can't-race-autosave, retry)
 * so it can be unit-tested without a DOM. The React component is a thin shell
 * that feeds inputs in and renders `state`/`listingId`/`fieldErrors` out.
 */

export type SaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; fieldErrors?: Record<string, string[]> };

export type UpdateResult =
  { ok: true } | { ok: false; fieldErrors?: Record<string, string[]> };

export interface DraftControllerPorts {
  /** Idempotent create — the same bootstrapKey must return the same listing. */
  createDraft: (
    payload: Record<string, unknown>,
    bootstrapKey: string,
  ) => Promise<CreateResult>;
  updateDraft: (
    id: string,
    payload: Record<string, unknown>,
  ) => Promise<UpdateResult>;
  /** Builds the current payload; `forCreate` adds the placeholder title. */
  buildPayload: (forCreate: boolean) => Record<string, unknown>;
  bootstrapKey: string;
  onChange?: () => void;
}

export class DraftController {
  private _state: SaveState = 'idle';
  private _listingId: string | null;
  private _fieldErrors: Record<string, string[]> = {};

  private bootstrapPromise: Promise<string | null> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private lastSaved = '';

  constructor(
    private readonly ports: DraftControllerPorts,
    initialId: string | null = null,
  ) {
    this._listingId = initialId;
  }

  get state(): SaveState {
    return this._state;
  }
  get listingId(): string | null {
    return this._listingId;
  }
  get fieldErrors(): Record<string, string[]> {
    return this._fieldErrors;
  }

  private setState(next: SaveState): void {
    this._state = next;
    this.ports.onChange?.();
  }

  /** Mark that the user has changed something (before the debounced save). */
  markUnsaved(): void {
    if (this._state !== 'saving') this.setState('unsaved');
    else this._state = 'unsaved'; // don't interrupt an in-flight "Saving…" label
  }

  /**
   * Ensure a draft exists, creating one at most once. Concurrent callers share
   * the same in-flight promise, so a field edit and a photo pick that race
   * still produce ONE listing (the server bootstrapKey is the final backstop).
   */
  ensureDraft(): Promise<string | null> {
    if (this._listingId) return Promise.resolve(this._listingId);
    if (this.bootstrapPromise) return this.bootstrapPromise;

    this.bootstrapPromise = (async () => {
      const res = await this.ports.createDraft(
        this.ports.buildPayload(true),
        this.ports.bootstrapKey,
      );
      if (!res.ok) {
        this.bootstrapPromise = null; // allow a later retry
        if (res.fieldErrors) {
          this._fieldErrors = res.fieldErrors;
          this.ports.onChange?.();
        }
        return null;
      }
      this._listingId = res.id;
      this.lastSaved = JSON.stringify(this.ports.buildPayload(false));
      this.ports.onChange?.();
      return res.id;
    })();
    return this.bootstrapPromise;
  }

  /** Enqueue a save of the CURRENT payload; saves never overlap. */
  save(): Promise<void> {
    this.queue = this.queue.then(
      () => this.saveOnce(),
      () => this.saveOnce(),
    );
    return this.queue;
  }

  private async saveOnce(): Promise<void> {
    const id = await this.ensureDraft();
    if (!id) {
      this.setState('error');
      return;
    }
    const payload = this.ports.buildPayload(false);
    const snapshot = JSON.stringify(payload);
    if (snapshot === this.lastSaved) {
      this.setState('saved');
      return;
    }
    this.setState('saving');
    const res = await this.ports.updateDraft(id, payload);
    if (!res.ok) {
      if (res.fieldErrors) this._fieldErrors = res.fieldErrors;
      this.setState('error');
      return;
    }
    this.lastSaved = snapshot;
    this._fieldErrors = {};
    this.setState('saved');
  }
}
