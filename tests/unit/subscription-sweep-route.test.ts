import { describe, it, expect } from 'vitest';
import { GET, POST } from '@/app/api/cron/subscription-sweep/route';

/**
 * Auth guard for the scheduled subscription-sweep endpoint. The happy path
 * (200 + actual sweep) is covered by the sweep-function tests + P5; here we lock
 * the SECURITY properties, which need no database because they short-circuit
 * before the job runs. `CRON_SECRET` is set to a fixed value in tests/setup.ts.
 */
const SECRET = 'test-cron-secret-0123456789abcdef';

function post(auth?: string): Request {
  const headers = new Headers();
  if (auth !== undefined) headers.set('authorization', auth);
  return new Request('http://localhost/api/cron/subscription-sweep', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/cron/subscription-sweep — auth guard', () => {
  it('rejects a missing Authorization header (401)', async () => {
    const res = await POST(post());
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret (401)', async () => {
    const res = await POST(post('Bearer wrong-secret'));
    expect(res.status).toBe(401);
  });

  it('rejects a bare secret without the Bearer scheme (401)', async () => {
    const res = await POST(post(SECRET));
    expect(res.status).toBe(401);
  });

  it('GET is not allowed (405)', () => {
    expect(GET().status).toBe(405);
  });
});
