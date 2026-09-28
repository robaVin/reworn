import 'server-only';

import { randomUUID } from 'node:crypto';
import type { HomepageSlot } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { timeSpan } from '@/lib/perf';
import { validateImageBytes } from '@/modules/catalog/image-validation';
import {
  processImage as defaultProcessImage,
  ImageProcessingError,
  type ProcessedImage,
} from '@/modules/catalog/image-processing';
import { getStorageAdapter } from '@/modules/catalog/storage';
import {
  OUTPUT_EXTENSION,
  SIGNED_URL_TTL_SECONDS,
} from '@/modules/catalog/image-config';
import { ImageRejectedError } from '@/modules/catalog/errors';

/**
 * Homepage-media service — the ONLY sanctioned path for reading/writing the
 * admin overrides of the fixed homepage image slots.
 *
 * REUSE: this deliberately reuses the hardened listing-image primitives —
 * `validateImageBytes` (magic-byte sniff + MIME-spoof reject), `processImage`
 * (Sharp: EXIF strip, resize, WebP re-encode), and the private-bucket
 * `StorageAdapter` (service-role, signed reads) — rather than a weaker parallel
 * uploader. Only the persistence shape differs (one row per slot, not per
 * listing), so this is a thin service, not a fork of the pipeline.
 *
 * Object keys are server-generated, immutable and versioned:
 * `homepage/<slot>/<uuid>.webp`. A replacement always writes a NEW object and
 * never overwrites the previous one, so a stale image can never be served and
 * the safe-replacement ordering can compensate cleanly on failure.
 */

/** An effective override for a slot: a signed read URL + admin alt text. */
export interface HomepageOverride {
  url: string;
  alt: string;
}

/** Processor seam (tests inject a fake so they need neither Sharp nor storage). */
export type ImageProcessor = (input: Buffer) => Promise<ProcessedImage>;
let processImage: ImageProcessor = defaultProcessImage;
export function setHomepageImageProcessor(
  next: ImageProcessor | undefined,
): void {
  processImage = next ?? defaultProcessImage;
}

function newSlotKey(slot: HomepageSlot): string {
  return `homepage/${slot}/${randomUUID()}.${OUTPUT_EXTENSION}`;
}

function assertValidAlt(alt: string): string {
  const trimmed = alt.trim();
  if (trimmed.length < 1 || trimmed.length > 300) {
    throw new ImageRejectedError('alt_invalid');
  }
  return trimmed;
}

/**
 * Current overrides for ALL slots, with freshly-signed read URLs (one batched
 * signing round-trip). A slot with no row — or whose key fails to sign — is
 * simply absent from the result, so the component renders its bundled fallback.
 * An EMPTY table returns `{}` and the homepage is visually unchanged.
 */
export async function resolveHomepageOverrides(): Promise<
  Partial<Record<HomepageSlot, HomepageOverride>>
> {
  const rows = await timeSpan('db.homepageMedia', () =>
    prisma.homepageMedia.findMany({
      select: { slot: true, storageKey: true, altText: true },
    }),
  );
  if (rows.length === 0) return {};

  const signed = await timeSpan(
    'storage.sign',
    () =>
      getStorageAdapter().createSignedUrls(
        rows.map((r) => r.storageKey),
        SIGNED_URL_TTL_SECONDS,
      ),
    { count: rows.length },
  );

  const out: Partial<Record<HomepageSlot, HomepageOverride>> = {};
  for (const r of rows) {
    const url = signed.get(r.storageKey);
    // Missing signature -> omit -> component falls back to public/photos.
    if (url) out[r.slot] = { url, alt: r.altText };
  }
  return out;
}

/**
 * Replace the image for one slot. SAFE ORDER (never destroys the working image):
 *   authorize (caller) -> validate bytes -> process/re-encode -> upload NEW
 *   object -> read the OLD key -> DB upsert (override now authoritative) ->
 *   best-effort remove OLD object.
 * If the DB upsert fails, the just-uploaded NEW object is removed (orphan
 * cleanup) and the old row/image stay intact. A failure to remove the OLD object
 * after a successful upsert is logged and never rolls back the replacement.
 * The bundled public/photos/* files are static and are never touched here.
 */
export async function replaceHomepageImage(
  adminUserId: string,
  slot: HomepageSlot,
  file: { bytes: Buffer; declaredMime?: string; alt: string },
): Promise<void> {
  const alt = assertValidAlt(file.alt);

  const validation = validateImageBytes(
    file.bytes.subarray(0, 32),
    file.declaredMime,
    file.bytes.byteLength,
  );
  if (!validation.ok)
    throw new ImageRejectedError(validation.reason ?? 'invalid');

  let processed: ProcessedImage;
  try {
    processed = await processImage(file.bytes);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw new ImageRejectedError(error.reason);
    }
    throw error;
  }

  const newKey = newSlotKey(slot);
  const storage = getStorageAdapter();

  // Upload the NEW object first — the old one keeps working until the DB flips.
  await storage.upload(newKey, processed.buffer, processed.mimeType);

  const existing = await prisma.homepageMedia.findUnique({
    where: { slot },
    select: { storageKey: true },
  });
  const oldKey = existing?.storageKey;

  try {
    await prisma.homepageMedia.upsert({
      where: { slot },
      create: {
        slot,
        storageKey: newKey,
        altText: alt,
        width: processed.width,
        height: processed.height,
        updatedById: adminUserId,
      },
      update: {
        storageKey: newKey,
        altText: alt,
        width: processed.width,
        height: processed.height,
        updatedById: adminUserId,
      },
    });
  } catch (dbError) {
    // Compensate: the DB never pointed at newKey, so remove the orphan. The old
    // override (if any) and its object are untouched and keep working.
    try {
      await storage.remove([newKey]);
    } catch (cleanupError) {
      logger.error('homepage media compensation failed', {
        key: newKey,
        error: cleanupError,
      });
    }
    throw dbError;
  }

  // The DB now resolves the new object. Best-effort delete the old one; a
  // failure only leaves a harmless orphan and never breaks the live image.
  if (oldKey && oldKey !== newKey) {
    try {
      await storage.remove([oldKey]);
    } catch (error) {
      logger.error('homepage media old-object cleanup failed (orphan left)', {
        key: oldKey,
        error,
      });
    }
  }
}

/**
 * Update ONLY the alt text of an existing override (image unchanged). Fails if
 * the slot has no override yet — there is no image to describe.
 */
export async function updateHomepageAlt(
  adminUserId: string,
  slot: HomepageSlot,
  alt: string,
): Promise<void> {
  const trimmed = assertValidAlt(alt);
  const res = await prisma.homepageMedia.updateMany({
    where: { slot },
    data: { altText: trimmed, updatedById: adminUserId },
  });
  if (res.count === 0) throw new ImageRejectedError('no_override');
}

/** One slot's current state for the admin editor. */
export interface AdminSlotState {
  slot: HomepageSlot;
  hasOverride: boolean;
  /** Signed preview of the current override, or null when using the fallback. */
  previewUrl: string | null;
  alt: string | null;
  updatedAt: Date | null;
}

/**
 * Current override state for every slot, for the admin editor. Slots without an
 * override report `hasOverride: false` (the editor shows the bundled fallback).
 */
export async function listHomepageSlotStates(): Promise<
  Partial<Record<HomepageSlot, AdminSlotState>>
> {
  const rows = await prisma.homepageMedia.findMany({
    select: {
      slot: true,
      storageKey: true,
      altText: true,
      updatedAt: true,
    },
  });
  if (rows.length === 0) return {};

  const signed = await getStorageAdapter().createSignedUrls(
    rows.map((r) => r.storageKey),
    SIGNED_URL_TTL_SECONDS,
  );

  const out: Partial<Record<HomepageSlot, AdminSlotState>> = {};
  for (const r of rows) {
    out[r.slot] = {
      slot: r.slot,
      hasOverride: true,
      previewUrl: signed.get(r.storageKey) ?? null,
      alt: r.altText,
      updatedAt: r.updatedAt,
    };
  }
  return out;
}
