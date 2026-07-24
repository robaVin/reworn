import { NextResponse, type NextRequest } from 'next/server';
import { requireAnyRole } from '@/modules/auth/guards';
import { AuthorizationError } from '@/modules/auth/errors';
import { addListingImage } from '@/modules/catalog/image-service';
import {
  ImageLimitError,
  ImageRejectedError,
  ListingConflictError,
} from '@/modules/catalog/errors';
import { MAX_UPLOAD_BYTES } from '@/modules/catalog/image-config';
import { logger } from '@/lib/logger';

/**
 * POST /api/seller/listings/[listingId]/images
 *
 * Multipart upload of a single listing image. Seller|admin only; ownership,
 * editable-state, per-listing image cap, signature validation and processing
 * (EXIF strip, resize, WebP re-encode) all happen server-side in the service.
 *
 * A raw size ceiling is enforced here BEFORE buffering to bound memory; the
 * decoded-dimension checks live in the processing step. On success returns the
 * new image's id/position — the client refreshes the server-rendered manager to
 * pick up fresh signed URLs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
): Promise<Response> {
  const { listingId } = await params;

  let userId: string;
  try {
    ({ userId } = await requireAnyRole(['seller', 'admin']));
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.reason },
        { status: error.status },
      );
    }
    throw error;
  }

  // Reject oversized bodies early via Content-Length when present.
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_UPLOAD_BYTES * 1.1) {
    return NextResponse.json(
      { error: 'image_rejected:too_large' },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file_required' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'image_rejected:too_large' },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    const image = await addListingImage(userId, listingId, {
      bytes,
      declaredMime: file.type || undefined,
    });
    return NextResponse.json(
      { id: image.id, position: image.position },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.reason },
        { status: error.status },
      );
    }
    if (
      error instanceof ImageRejectedError ||
      error instanceof ImageLimitError
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof ListingConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    logger.error('image upload failed', { listingId, error });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
