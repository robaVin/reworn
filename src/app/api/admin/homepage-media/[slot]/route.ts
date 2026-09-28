import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/modules/auth/guards';
import { AuthorizationError } from '@/modules/auth/errors';
import { verifyCsrf } from '@/lib/security/csrf';
import { readBoundedBody, PayloadTooLargeError } from '@/lib/http/bounded-body';
import {
  enforceActionRateLimit,
  RateLimitedError,
} from '@/lib/security/rate-limit';
import { replaceHomepageImage } from '@/modules/homepage-media/service';
import { isHomepageSlot } from '@/modules/homepage-media/slots';
import { ImageRejectedError } from '@/modules/catalog/errors';
import { MAX_UPLOAD_BYTES } from '@/modules/catalog/image-config';
import { logger } from '@/lib/logger';

/**
 * POST /api/admin/homepage-media/[slot]?alt=<url-encoded alt text>
 *
 * Replaces the picture in one fixed homepage slot. RAW body = the image bytes
 * (no multipart), exactly like the listing-image route, so a large upload is
 * bounded while streaming and no client filename/storage-path is ever trusted.
 *
 * Security posture (defence in depth):
 *   - ADMIN role verified SERVER-SIDE (`requireAdmin`) — never a client identity/
 *     role/hidden field/hardcoded email. Non-admins get 403/404.
 *   - Same-origin (CSRF) re-asserted here (middleware also enforces).
 *   - Per-admin rate limit (`adminMediaWrite`).
 *   - Payload bounded during the stream read; magic-byte validation + Sharp
 *     re-encode happen in the service before anything is trusted.
 *   - Object key is generated server-side; the private bucket + service role
 *     stay server-only. Safe-replacement ordering lives in the service.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slot: string }> },
): Promise<Response> {
  const { slot } = await params;

  // Same-origin (CSRF).
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

  // Admin only — independently verified server-side.
  let userId: string;
  try {
    ({ userId } = await requireAdmin());
    enforceActionRateLimit('adminMediaWrite', userId);
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }
    if (error instanceof AuthorizationError) {
      // 404 hides the admin area's existence for non-admins.
      return NextResponse.json(
        { error: error.reason },
        { status: error.status },
      );
    }
    throw error;
  }

  // Closed set of slots — reject anything else.
  if (!isHomepageSlot(slot)) {
    return NextResponse.json({ error: 'invalid_slot' }, { status: 400 });
  }

  // Required alt text from the query (plain text, 1-300 chars, validated fully
  // in the service against the same rule the DB CHECK enforces).
  const alt = request.nextUrl.searchParams.get('alt') ?? '';

  // Fast reject via Content-Length; authoritative bound is the streaming cap.
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

  const declaredMime = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    ?.trim()
    .toLowerCase();

  try {
    await replaceHomepageImage(userId, slot, {
      bytes,
      declaredMime: declaredMime || undefined,
      alt,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: error.reason },
        { status: error.status },
      );
    }
    if (error instanceof ImageRejectedError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    logger.error('homepage media upload failed', { slot, error });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
