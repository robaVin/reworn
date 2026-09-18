import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

/**
 * RH-1 — middleware-level CSRF behaviour, exercising the REAL edge middleware
 * (not `route.POST()` directly). This is the layer that would otherwise 403 a
 * legitimate server-to-server webhook/cron POST before the handler's signature/
 * secret check ever runs.
 *
 * We assert the OBSERVABLE middleware contract:
 *  - a cross-origin / origin-less POST to a normal path is rejected with a bare
 *    403 (no security headers — it never reaches the response pipeline);
 *  - an origin-less POST to an exempt server-to-server path passes CSRF and flows
 *    through the full pipeline (200 + security headers stamped);
 *  - a same-origin browser POST to a normal path is allowed.
 *
 * The middleware still refreshes the session (a local no-op here: no auth
 * cookies ⇒ no network), so this also proves the pipeline runs end to end.
 */

const APP = 'http://localhost:3000'; // matches NEXT_PUBLIC_APP_URL in tests/setup.ts

function post(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(new URL(path, APP), { method: 'POST', headers });
}

/** A response that passed CSRF gets security headers; a rejected one does not. */
function passedPipeline(res: Response): boolean {
  return res.headers.get('x-content-type-options') === 'nosniff';
}

describe('middleware CSRF — server-to-server exempt paths (RH-1)', () => {
  const EXEMPT = ['/api/payments/webhook', '/api/cron/subscription-sweep'];

  it.each(EXEMPT)(
    'lets an origin-less POST to %s reach the handler pipeline',
    async (path) => {
      const res = await middleware(post(path));
      expect(res.status).not.toBe(403);
      expect(passedPipeline(res)).toBe(true);
    },
  );

  it.each(EXEMPT)(
    'lets a foreign-origin POST to %s through (auth is the signature, not Origin)',
    async (path) => {
      const res = await middleware(
        post(path, { origin: 'https://provider.example' }),
      );
      expect(res.status).not.toBe(403);
      expect(passedPipeline(res)).toBe(true);
    },
  );
});

describe('middleware CSRF — non-exempt paths stay protected', () => {
  it('rejects an origin-less POST to a normal API path with a bare 403', async () => {
    const res = await middleware(post('/api/seller/listings/abc/images'));
    expect(res.status).toBe(403);
    // A rejected request never reaches the security-header pipeline.
    expect(passedPipeline(res)).toBe(false);
  });

  it('rejects a cross-origin POST to a payments sibling path (not the webhook)', async () => {
    const res = await middleware(
      post('/api/payments/checkout', { origin: 'https://evil.example' }),
    );
    expect(res.status).toBe(403);
  });

  it('rejects a POST whose path merely prefixes the exempt path', async () => {
    // `/api/payments/webhookX` shares the string prefix but is a different route.
    const res = await middleware(post('/api/payments/webhookX'));
    expect(res.status).toBe(403);
  });

  it('allows a same-origin browser POST to a normal path', async () => {
    const res = await middleware(post('/api/x', { origin: APP }));
    expect(res.status).not.toBe(403);
    expect(passedPipeline(res)).toBe(true);
  });

  it('allows safe GET navigation to pass through', async () => {
    const res = new NextRequest(new URL('/browse', APP), { method: 'GET' });
    const out = await middleware(res);
    expect(out.status).not.toBe(403);
    expect(passedPipeline(out)).toBe(true);
  });
});
