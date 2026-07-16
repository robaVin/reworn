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

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfResult {
  ok: boolean;
  reason?: string;
}

/**
 * Routes that legitimately receive cross-origin POSTs and therefore cannot
 * use origin checking. Each MUST authenticate the caller cryptographically.
 *
 * The bank payment callback will be added here once the official signing
 * rules are known — it will be verified by signature, not by Origin.
 */
const ORIGIN_CHECK_EXEMPT_PATHS: readonly string[] = [];

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
 * @param allowedOrigin the application's own origin
 */
export function verifyCsrf(
  method: string,
  pathname: string,
  origin: string | null,
  referer: string | null,
  allowedOrigin: string,
): CsrfResult {
  if (SAFE_METHODS.has(method.toUpperCase())) return { ok: true };
  if (isExemptFromCsrf(pathname)) return { ok: true };

  const candidate = origin ?? refererOrigin(referer);

  // Neither header present on an unsafe method: reject. Browsers always send
  // Origin on cross-origin state-changing requests, so absence is suspicious.
  if (!candidate) {
    return { ok: false, reason: 'missing_origin_and_referer' };
  }

  if (candidate !== allowedOrigin) {
    return { ok: false, reason: 'origin_mismatch' };
  }

  return { ok: true };
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
