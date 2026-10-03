/**
 * CSRF protection.
 *
 * Strategy: origin verification on state-changing requests.
 *
 * Why this and not a token?
 * -------------------------
 * Supabase issues cookie-backed sessions. Cookies are set `SameSite=Lax`,
 * which already blocks cross-site POSTs from a third-party page. Origin
 * checking is the standard defence-in-depth layer on top of that, it is
 * stateless (works on Edge), and it cannot be bypassed by a subdomain that
 * can write cookies. A synchroniser token adds little here and a great deal
 * of plumbing.
 *
 * If a future flow needs to accept a genuine cross-origin POST (for example a
 * bank gateway posting a callback), that route must be explicitly exempted
 * and protected by SIGNATURE VERIFICATION instead — never by trusting Origin.
 */

import type { NextRequest } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfResult {
  ok: boolean;
  reason?: string;
}

/**
 * Routes that legitimately receive cross-origin, server-to-server POSTs and
 * therefore CANNOT use origin checking — the caller is a payment provider or a
 * scheduler, not a browser, so it sends no matching `Origin`/`Referer`. Origin
 * verification would reject them with `missing_origin_and_referer` before the
 * handler runs, so they are exempted HERE and each MUST authenticate the caller
 * cryptographically in its own handler:
 *
 *  - /api/payments/webhook       — verified by provider SIGNATURE over the raw
 *                                  body (fails closed: 503 if unconfigured, 400
 *                                  on a bad/absent signature).
 *  - /api/cron/subscription-sweep — verified by a constant-time CRON_SECRET
 *                                  bearer compare (fails closed: 503 if unset,
 *                                  401 on mismatch).
 *
 * Exemption removes ONLY the browser-oriented Origin check; it never removes the
 * signature/secret checks, which are the real authentication for these paths.
 * Matched by exact path or as a path prefix (see isExemptFromCsrf).
 */
const ORIGIN_CHECK_EXEMPT_PATHS: readonly string[] = [
  '/api/payments/webhook',
  '/api/cron/subscription-sweep',
];

export function isExemptFromCsrf(pathname: string): boolean {
  return ORIGIN_CHECK_EXEMPT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Verifies that a state-changing request originated from this application.
 *
 * @param method    HTTP method
 * @param pathname  request path (for exemptions)
 * @param origin    the `Origin` header
 * @param referer   the `Referer` header (fallback)
 * @param allowedOrigins one origin, or several, any of which the request may
 *                       legitimately carry (the app's own origin(s))
 */
export function verifyCsrf(
  method: string,
  pathname: string,
  origin: string | null,
  referer: string | null,
  allowedOrigins: string | readonly string[],
): CsrfResult {
  if (SAFE_METHODS.has(method.toUpperCase())) return { ok: true };
  if (isExemptFromCsrf(pathname)) return { ok: true };

  const candidate = origin ?? refererOrigin(referer);

  // Neither header present on an unsafe method: reject. Browsers always send
  // Origin on cross-origin state-changing requests, so absence is suspicious.
  if (!candidate) {
    return { ok: false, reason: 'missing_origin_and_referer' };
  }

  const allowed =
    typeof allowedOrigins === 'string' ? [allowedOrigins] : allowedOrigins;
  if (!allowed.includes(candidate)) {
    return { ok: false, reason: 'origin_mismatch' };
  }

  return { ok: true };
}

/**
 * The origins a same-origin, state-changing request may legitimately carry.
 *
 * Always includes the configured app origin (`NEXT_PUBLIC_APP_URL`). It ALSO
 * includes the origin the request was actually served on — reconstructed from
 * the platform edge's `x-forwarded-host` / `x-forwarded-proto` — so the check
 * holds on the real public host (custom domain, `www`, the platform URL, a
 * preview URL) even when `NEXT_PUBLIC_APP_URL` is unset or points at a different
 * one of the app's own domains. This is the standard same-origin CSRF check:
 * the forwarded host is set by the CDN/edge, not the client, and a genuine
 * cross-site request still carries a foreign `Origin` that matches neither.
 */
export function buildAllowedOrigins(
  configuredOrigin: string,
  forwardedHost: string | null,
  forwardedProto: string | null,
): string[] {
  const origins = [configuredOrigin];
  const host = forwardedHost?.split(',')[0]?.trim();
  if (host) {
    const proto = forwardedProto?.split(',')[0]?.trim() || 'https';
    const self = `${proto}://${host}`;
    if (!origins.includes(self)) origins.push(self);
  }
  return origins;
}

/**
 * Request-aware CSRF check: resolves the allowed origins (configured +
 * actual-served) from the request, then verifies. Use this from middleware and
 * route handlers instead of assembling the origin list by hand.
 */
export function verifyCsrfForRequest(request: NextRequest): CsrfResult {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  const allowed = buildAllowedOrigins(
    configuredOrigin,
    request.headers.get('x-forwarded-host'),
    request.headers.get('x-forwarded-proto'),
  );
  return verifyCsrf(
    request.method,
    request.nextUrl.pathname,
    request.headers.get('origin'),
    request.headers.get('referer'),
    allowed,
  );
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
