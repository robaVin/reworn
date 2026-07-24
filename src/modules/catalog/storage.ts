import 'server-only';

import { getPrivilegedClient } from '@/lib/supabase/admin';
import { IMAGE_BUCKET } from './image-config';

/**
 * Object-storage boundary. The image service depends on this interface, so
 * automated tests inject a fake in-memory adapter instead of live Supabase
 * Storage (see `setStorageAdapter`).
 */
export interface StorageAdapter {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export class StorageError extends Error {
  constructor(readonly reason: string) {
    super(`storage:${reason}`);
    this.name = 'StorageError';
  }
}

/** Real adapter backed by a PRIVATE Supabase Storage bucket (service role). */
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly bucket = IMAGE_BUCKET;

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await getPrivilegedClient()
      .storage.from(this.bucket)
      .upload(key, body, { contentType, upsert: false });
    if (error) throw new StorageError(`upload_failed:${error.message}`);
  }

  async remove(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { error } = await getPrivilegedClient()
      .storage.from(this.bucket)
      .remove(keys);
    if (error) throw new StorageError(`remove_failed:${error.message}`);
  }

  async createSignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const { data, error } = await getPrivilegedClient()
      .storage.from(this.bucket)
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data?.signedUrl) {
      throw new StorageError(`sign_failed:${error?.message ?? 'no_url'}`);
    }
    return data.signedUrl;
  }
}

let adapter: StorageAdapter | undefined;

export function getStorageAdapter(): StorageAdapter {
  if (!adapter) adapter = new SupabaseStorageAdapter();
  return adapter;
}

/** Test seam: inject a fake adapter (or reset with `undefined`). */
export function setStorageAdapter(next: StorageAdapter | undefined): void {
  adapter = next;
}
