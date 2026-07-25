import { NextResponse, type NextRequest } from 'next/server';
import { requireAnyRole } from '@/modules/auth/guards';
import { AuthorizationError } from '@/modules/auth/errors';
import { verifyCsrf } from '@/lib/security/csrf';
import { readBoundedBody, PayloadTooLargeError } from '@/lib/http/bounded-body';
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
 * Uploads a single listing image as a RAW body (no multipart): the whole request
 * body IS the image bytes and the declared type is the `Content-Type` header.
 * This guarantees exactly one file, ignores any client-supplied filename, and
 * lets us bound the payload while streaming (see `readBoundedBody`) instead of
 * buffering an unbounded multipart form first.
 *
 * Security posture (defence in depth):
 *   - Auth + seller|admin role verified SERVER-SIDE (`requireAnyRole`).
 *   - Listing OWNERSHIP + editable-state verified in the service BEFORE any
 *     processing (404 hides existence; IDOR-safe).
 *   - Same-origin (CSRF) enforced by middleware for all unsafe methods, AND
 *     re-checked here so the guarantee is local to the route and testable.
 *   - Request size bounded during the stream read (memory-safe); the file
 *     SIGNATURE (magic bytes) is validated before sharp ever decodes it, and
 *     decompression-bomb dimensions are rejected inside processing.
 *   - Storage/service-role access stays server-only (privileged client).
 *
 * On success returns the new image's id/position; the client refreshes the
 * server-rendered manager to obtain fresh signed URLs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listingId: string }> },
): Promise<Response> {
  const { listingId } = await params;

  // Same-origin (CSRF) — middleware already enforces this; re-assert locally.
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const csrf = verifyCsrf(
    request.method,
    request.nextUrl.pathname,
    request.headers.get('origin'),
    request.headers.get('referer'),
    appOrigin,
  );
  if (!csrf.ok) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

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

  // Fast reject via Content-Length when present; the authoritative bound is the
  // streaming cap below (a hostile client can omit or lie about the header).
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'image_rejected:too_large' },
      { status: 413 },
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readBoundedBody(request.body, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return NextResponse.json(
        { error: 'image_rejected:too_large' },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: 'file_required' }, { status: 400 });
  }

  // Declared MIME comes from the header only; it is UNTRUSTED and cross-checked
  // against the real magic bytes inside the service.
  const declaredMime = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();

  try {
    const image = await addListingImage(userId, listingId, {
      bytes,
      declaredMime: declaredMime || undefined,
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
