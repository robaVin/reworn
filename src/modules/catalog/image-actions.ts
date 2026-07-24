'use server';

import { requireAnyRole } from '@/modules/auth/guards';
import {
  deleteListingImage,
  getListingImagesForViewer,
  reorderListingImages,
  type ListingImageView,
} from './image-service';
import { actionOk, toActionError, type ActionResult } from './action-result';

/**
 * Image mutation server actions (delete / reorder) consumed by the seller image
 * manager. Every action re-verifies the seller|admin role server-side; ownership
 * and editable-state are enforced in the service. Uploads go through the route
 * handler (multipart) instead — Server Actions are CSRF-protected by Next.js.
 */

export async function deleteListingImageAction(
  imageId: string,
): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    await deleteListingImage(ctx.userId, imageId);
    return actionOk(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

export async function reorderListingImagesAction(
  listingId: string,
  orderedImageIds: string[],
): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    await reorderListingImages(ctx.userId, listingId, orderedImageIds);
    return actionOk(undefined);
  } catch (error) {
    return toActionError(error);
  }
}

/** List the seller's own images for a listing (fresh signed read URLs). */
export async function listListingImagesAction(
  listingId: string,
): Promise<ActionResult<ListingImageView[]>> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    const images = await getListingImagesForViewer(ctx, listingId);
    return actionOk(images);
  } catch (error) {
    return toActionError(error);
  }
}
