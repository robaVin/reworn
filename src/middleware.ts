import { NextResponse, type NextRequest } from 'next/server';
import {
  buildContentSecurityPolicy,
  generateNonce,
  securityHeaders,
} from '@/lib/security/headers';
import { verifyCsrf } from '@/lib/security/csrf';
import { checkRateLimit, clientIdentity } from '@/lib/security/rate-limit';
import { refreshSession } from '@/lib/supabase/middleware';

/**
 * Edge middleware — the outermost security boundary.
 *
 * Responsibilities, in order:
 *   1. CSRF: reject cross-origin state-changing requests.
 *   2. Rate limiting: throttle sensitive endpoints.
 *   3. Security headers + nonce-based CSP on every response.
 *
 * This is defence in depth, NOT the authorisation boundary. Authorisation is
 * enforced server-side per operation and again by Postgres Row-Level Security.
 */

/** Paths where abuse is most damaging and therefore throttled hardest. */
const SENSITIVE_PATH_PREFIXES = ['/api/auth', '/api/payments', '/auth'];

function isSensitive(pathname: string): boolean {
  return SENSITIVE_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * A4 instrumentation: when PERF_TRACE=1 (inlined at build), the middleware emits
 * a `Server-Timing` response header with the total middleware duration and the
 * `refreshSession` (Supabase `getUser()`) network portion. This distinguishes
 * middleware CPU from the Auth network round-trip and is visible in `curl -D-`
 * and Chrome DevTools. Off by default → no timing disclosure in production.
 */
const PERF = process.env.PERF_TRACE === '1';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const startedAt = PERF ? performance.now() : 0;
  const { pathname } = request.nextUrl;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  /* ---------------------------------------------------------------- CSRF */
  const csrf = verifyCsrf(
    request.method,
    pathname,
    request.headers.get('origin'),
    request.headers.get('referer'),
    appOrigin,
  );

  if (!csrf.ok) {
    // Deliberately terse: do not tell an attacker which check failed.
    return jsonError(403, 'Forbidden');
  }

  /* ---------------------------------------------------------- Rate limit */
  if (isSensitive(pathname)) {
    const max = Number(process.env.RATE_LIMIT_MAX ?? 20);
    const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
    const identity = clientIdentity(request.headers);

    const result = checkRateLimit(pathname, identity, max, windowSeconds);

    if (!result.allowed) {
      const retryAfter = Math.max(
        Math.ceil((result.resetAt - Date.now()) / 1000),
        1,
      );
      const response = jsonError(429, 'Too many requests');
      response.headers.set('Retry-After', String(retryAfter));
      return applySecurity(response, generateNonce());
    }
  }

  /* ------------------------------------------------------------ Headers */
  const nonce = generateNonce();

  // Expose the nonce to Server Components so they can nonce any inline script.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // REQUIRED for hydration: Next.js reads the CSP from the REQUEST headers to
  // discover the nonce and stamp it onto its own inline/bootstrap scripts.
  // Without this, the nonce-based policy blocks Next's scripts and no client
  // component hydrates in production builds.
  requestHeaders.set(
    'content-security-policy',
    buildContentSecurityPolicy(nonce),
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the Supabase session (rotates tokens, writes cookies onto the
  // response). This is a convenience layer only — NOT authorization. Every
  // protected route independently re-verifies the user server-side.
  const authStart = PERF ? performance.now() : 0;
  await refreshSession(request, response);

  if (PERF) {
    const authMs = Math.round(performance.now() - authStart);
    const totalMs = Math.round(performance.now() - startedAt);
    // `mwauth` = the Supabase getUser() network round-trip; `mw` = total middleware.
    response.headers.set(
      'Server-Timing',
      `mwauth;dur=${authMs}, mw;dur=${totalMs}`,
    );
  }

  return applySecurity(response, nonce);
}

function applySecurity(response: NextResponse, nonce: string): NextResponse {
  for (const [key, value] of Object.entries(securityHeaders(nonce))) {
    response.headers.set(key, value);
  }
  return response;
}

function jsonError(status: number, message: string): NextResponse {
  return new NextResponse(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets. Those are
     * immutable public files and do not need per-request policy evaluation.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js).*)',
  ],
};
