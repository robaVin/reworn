import 'server-only';

import { getPrivilegedClient } from '@/lib/supabase/admin';
import { IMAGE_BUCKET } from './image-config';

/**
 * Object-storage boundary. The image service depends on this interface, so
 * automated tests inject a fake in-memory adapter instead of live Supabase
 * Storage (see `setStorageAdapter`).
 */
/** Metadata for an object enumerated during reconciliation. */
export interface StorageObjectInfo {
  key: string;
  createdAt: Date | null;
}

export interface StorageAdapter {
  upload(key: string, body: Buffer, contentType: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  createSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  /**
   * Batch-signs many keys in ONE request (used for listing covers). Returns a
   * key→URL map; keys that fail to sign are simply absent from the map.
   */
  createSignedUrls(
    keys: string[],
    expiresInSeconds: number,
  ): Promise<Map<string, string>>;
  /**
   * Enumerates stored objects (recursively, one level of `<listingId>/<file>`).
   * Used only by the reconciliation command; keys are non-sensitive.
   */
  list(prefix?: string): Promise<StorageObjectInfo[]>;
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

  async createSignedUrls(
    keys: string[],
    expiresInSeconds: number,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (keys.length === 0) return out;
    const { data, error } = await getPrivilegedClient()
      .storage.from(this.bucket)
      .createSignedUrls(keys, expiresInSeconds);
    if (error || !data) {
      throw new StorageError(`sign_failed:${error?.message ?? 'no_urls'}`);
    }
    for (const row of data) {
      if (row.signedUrl && row.path) out.set(row.path, row.signedUrl);
    }
    return out;
  }

  async list(prefix = ''): Promise<StorageObjectInfo[]> {
    const bucket = getPrivilegedClient().storage.from(this.bucket);
    const out: StorageObjectInfo[] = [];

    // Object keys are `<listingId>/<uuid>.webp`, so we enumerate the listingId
    // "folders" at the root, then the files inside each. Supabase paginates.
    const pageSize = 100;
    const listPage = async (path: string, offset: number) => {
      const { data, error } = await bucket.list(path, {
        limit: pageSize,
        offset,
      });
      if (error) throw new StorageError(`list_failed:${error.message}`);
      return data ?? [];
    };
    const listAll = async (path: string) => {
      const acc: Awaited<ReturnType<typeof listPage>> = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await listPage(path, offset);
        acc.push(...page);
        if (page.length < pageSize) break;
      }
      return acc;
    };

    const folders = await listAll(prefix);
    for (const folder of folders) {
      // Folders have a null `id`; a file at the root would have an id.
      if (folder.id === null) {
        const base = prefix ? `${prefix}/${folder.name}` : folder.name;
        const files = await listAll(base);
        for (const file of files) {
          if (file.id === null) continue; // ignore nested folders (not expected)
          out.push({
            key: `${base}/${file.name}`,
            createdAt: file.created_at ? new Date(file.created_at) : null,
          });
        }
      } else {
        out.push({
          key: prefix ? `${prefix}/${folder.name}` : folder.name,
          createdAt: folder.created_at ? new Date(folder.created_at) : null,
        });
      }
    }
    return out;
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
