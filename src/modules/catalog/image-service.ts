import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ListingImage } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isAdmin } from '@/modules/auth/roles';
import type { AuthContext } from '@/modules/auth/authorization';
import { AuthorizationError } from '@/modules/auth/errors';
import {
  ImageLimitError,
  ImageRejectedError,
  ListingConflictError,
} from './errors';
import { isEditable } from './listing-status';
import { validateImageBytes } from './image-validation';
import {
  processImage as defaultProcessImage,
  ImageProcessingError,
  type ProcessedImage,
} from './image-processing';
import { getStorageAdapter } from './storage';
import {
  MAX_LISTING_IMAGES,
  OUTPUT_EXTENSION,
  SIGNED_URL_TTL_SECONDS,
} from './image-config';

/**
 * Listing-image service — the ONLY sanctioned path for image reads/writes.
 * Privileged writes with explicit server-side ownership; RLS governs the read
 * path as defence in depth. Files live in a private bucket; reads are signed.
 */

export type Viewer = Pick<AuthContext, 'userId' | 'roles'> | null;

export interface ListingImageView {
  id: string;
  position: number;
  width: number;
  height: number;
  url: string;
}

const listingWithOwner = {
  include: { seller: { select: { id: true, profileId: true, status: true } } },
};

/** Loads a listing and asserts the user owns it (404 hides existence). */
async function loadOwnedListing(userId: string, listingId: string) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    ...listingWithOwner,
  });
  if (!listing || listing.seller.profileId !== userId) {
    throw new AuthorizationError(404, 'not_found');
  }
  return listing;
}

function randomKey(listingId: string): string {
  return `${listingId}/${randomUUID()}.${OUTPUT_EXTENSION}`;
}

/**
 * Image processor seam. Defaults to the real sharp-backed processor; tests that
 * exercise service orchestration (ownership, ordering, compensation) inject a
 * lightweight fake so they need neither sharp nor the Node-20 native binary. The
 * real processing behaviour (EXIF strip, orientation, resize) has its own test.
 */
export type ImageProcessor = (input: Buffer) => Promise<ProcessedImage>;

let processImage: ImageProcessor = defaultProcessImage;

export function setImageProcessor(next: ImageProcessor | undefined): void {
  processImage = next ?? defaultProcessImage;
}

/**
 * Add an image to an owned, editable listing.
 *
 * Order of operations is STORAGE-FIRST with COMPENSATION:
 *   1. validate (magic bytes, size) → 2. process (sharp: EXIF strip, orient,
 *   resize, re-encode) → 3. upload to storage → 4. create the DB row.
 * If the DB write fails after a successful upload, the stored object is removed
 * so no orphan is left. If the upload fails, no DB row exists. A retry is
 * therefore always clean (no partial state).
 */
export async function addListingImage(
  userId: string,
  listingId: string,
  file: { bytes: Buffer; declaredMime?: string },
): Promise<ListingImage> {
  const listing = await loadOwnedListing(userId, listingId);
  if (!isEditable(listing.status)) {
    throw new ListingConflictError('listing_not_editable');
  }

  const count = await prisma.listingImage.count({ where: { listingId } });
  if (count >= MAX_LISTING_IMAGES) {
    throw new ImageLimitError(MAX_LISTING_IMAGES);
  }

  const validation = validateImageBytes(
    file.bytes.subarray(0, 32),
    file.declaredMime,
    file.bytes.byteLength,
  );
  if (!validation.ok) {
    throw new ImageRejectedError(validation.reason ?? 'invalid');
  }

  let processed;
  try {
    processed = await processImage(file.bytes);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      throw new ImageRejectedError(error.reason);
    }
    throw error;
  }

  const key = randomKey(listingId);
  const storage = getStorageAdapter();

  // 3. Upload first.
  await storage.upload(key, processed.buffer, processed.mimeType);

  // 4. Persist; compensate storage on failure.
  try {
    return await prisma.listingImage.create({
      data: {
        listingId,
        storageKey: key,
        position: count, // next slot; position 0 is the cover
        width: processed.width,
        height: processed.height,
        byteSize: processed.byteSize,
        mimeType: processed.mimeType,
      },
    });
  } catch (dbError) {
    // Storage cleanup when database persistence fails (no orphaned object).
    try {
      await storage.remove([key]);
    } catch (cleanupError) {
      logger.error('image storage compensation failed', {
        key,
        error: cleanupError,
      });
    }
    throw dbError;
  }
}

/** Delete an owned image and re-normalise remaining positions to 0..n-1. */
export async function deleteListingImage(
  userId: string,
  imageId: string,
): Promise<void> {
  const image = await prisma.listingImage.findUnique({
    where: { id: imageId },
    include: {
      listing: {
        include: {
          seller: { select: { profileId: true } },
        },
      },
    },
  });
  if (!image || image.listing.seller.profileId !== userId) {
    throw new AuthorizationError(404, 'not_found');
  }
  if (!isEditable(image.listing.status)) {
    throw new ListingConflictError('listing_not_editable');
  }

  // Delete row + renumber siblings atomically.
  await prisma.$transaction(async (tx) => {
    await tx.listingImage.delete({ where: { id: imageId } });
    const remaining = await tx.listingImage.findMany({
      where: { listingId: image.listingId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    for (let i = 0; i < remaining.length; i++) {
      await tx.listingImage.update({
        where: { id: remaining[i]!.id },
        data: { position: i },
      });
    }
  });

  // Remove the object; a failure here only leaves a harmless orphan (logged).
  try {
    await getStorageAdapter().remove([image.storageKey]);
  } catch (error) {
    logger.error('image storage delete failed (orphan left)', {
      key: image.storageKey,
      error,
    });
  }
}

/**
 * Reorder an owned listing's images. `orderedImageIds` must be a permutation of
 * the listing's current image ids. Position 0 becomes the cover.
 */
export async function reorderListingImages(
  userId: string,
  listingId: string,
  orderedImageIds: string[],
): Promise<void> {
  const listing = await loadOwnedListing(userId, listingId);
  if (!isEditable(listing.status)) {
    throw new ListingConflictError('listing_not_editable');
  }

  const current = await prisma.listingImage.findMany({
    where: { listingId },
    select: { id: true },
  });
  const currentIds = new Set(current.map((i) => i.id));
  const nextIds = new Set(orderedImageIds);
  const isPermutation =
    currentIds.size === nextIds.size &&
    orderedImageIds.length === currentIds.size &&
    orderedImageIds.every((id) => currentIds.has(id));
  if (!isPermutation) {
    throw new ImageRejectedError('reorder_mismatch');
  }

  await prisma.$transaction(
    orderedImageIds.map((id, index) =>
      prisma.listingImage.update({ where: { id }, data: { position: index } }),
    ),
  );
}

/** Ordered images (with signed read URLs) for anyone allowed to see them. */
export async function getListingImagesForViewer(
  viewer: Viewer,
  listingId: string,
): Promise<ListingImageView[]> {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    ...listingWithOwner,
  });
  if (!listing) return [];

  const canSee =
    listing.status === 'published' ||
    (viewer && listing.seller.profileId === viewer.userId) ||
    (viewer && isAdmin(viewer.roles));
  if (!canSee) return [];

  const images = await prisma.listingImage.findMany({
    where: { listingId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  if (images.length === 0) return [];

  // Sign ALL keys in a single batched request (one round-trip, not N).
  const signed = await getStorageAdapter().createSignedUrls(
    images.map((img) => img.storageKey),
    SIGNED_URL_TTL_SECONDS,
  );

  return images.map((img) => ({
    id: img.id,
    position: img.position,
    width: img.width,
    height: img.height,
    url: signed.get(img.storageKey) ?? '',
  }));
}
