/**
 * Security headers and Content-Security-Policy.
 *
 * Single source of truth, applied by middleware.ts to every HTML response.
 *
 * Design notes
 * ------------
 * - NO WILDCARD SOURCES. Allowed origins are derived from configuration, so
 *   the policy stays tight to exactly the services we use.
 * - Reads `process.env` directly rather than importing `src/lib/env.ts`,
 *   because middleware runs in the Edge runtime where the `server-only`
 *   guard in that module does not apply cleanly.
 *
 * Service compatibility
 * ---------------------
 * - Supabase Auth/DB/Storage : `connect-src` https + wss (Realtime),
 *                              `img-src` for Storage-served images.
 * - Google authentication    : performed as a full-page OAuth redirect via
 *                              Supabase, so the browser navigates away. No
 *                              Google origin needs allow-listing. (Google One
 *                              Tap would require accounts.google.com in
 *                              script-src/frame-src — we do not use it.)
 * - next/font               : fonts are self-hosted at build time, so
 *                              `font-src 'self'` suffices; no fonts.gstatic.com.
 * - Sentry                  : `connect-src` for the DSN origin, when set.
 * - Vercel                  : no additional origins required for production.
 */

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Generates a base64 nonce using Web Crypto (Edge-runtime compatible). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildContentSecurityPolicy(nonce: string): string {
  const isProd = process.env.NODE_ENV === 'production';

  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabase ? supabase.replace(/^https:/, 'wss:') : null;
  const sentry = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);

  const isSource = (s: string | null): s is string => s !== null && s !== '';

  const connect = ["'self'", supabase, supabaseWs, sentry].filter(isSource);
  const img = ["'self'", 'data:', 'blob:', supabase].filter(isSource);

  const script = isProd
    ? ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]
    : // Development only: Next.js HMR requires eval. Never shipped to prod.
      ["'self'", "'unsafe-eval'", "'unsafe-inline'"];

  const directives: Record<string, string[] | null> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"], // clickjacking
    'frame-src': ["'none'"],
    'form-action': ["'self'"], // the bank gateway origin is added when known
    'script-src': script,
    // Styles are inlined by Next.js/Tailwind at runtime. `unsafe-inline` is
    // scoped to styles only; it is not an XSS vector on its own and no
    // third-party style origin is permitted.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': img,
    'font-src': ["'self'"],
    'connect-src': connect,
    'worker-src': ["'self'", 'blob:'], // service worker (PWA)
    'manifest-src': ["'self'"],
    'media-src': ["'self'"],
    ...(isProd ? { 'upgrade-insecure-requests': [] } : {}),
  };

  return Object.entries(directives)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => (v && v.length > 0 ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

export function securityHeaders(nonce: string): Record<string, string> {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    'Content-Security-Policy': buildContentSecurityPolicy(nonce),

    // Legacy clickjacking defence; `frame-ancestors` is the modern control.
    'X-Frame-Options': 'DENY',

    // Never let a browser MIME-sniff a response into something executable.
    'X-Content-Type-Options': 'nosniff',

    // Do not leak full URLs (which may contain identifiers) cross-origin.
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Deny powerful features we never use.
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
    ].join(', '),

    'X-DNS-Prefetch-Control': 'off',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',

    // HSTS only over real TLS; sending it on http://localhost would poison
    // the developer's browser for all localhost ports.
    ...(isProd
      ? {
          'Strict-Transport-Security':
            'max-age=63072000; includeSubDomains; preload',
        }
      : {}),
  };
}
