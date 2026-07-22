import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route-handler tests for new auth endpoints.
 * Supabase is mocked — these assert enumeration-safe responses and session
 * requirements, not live provider behaviour.
 */

const signUp = vi.fn();
const resetPasswordForEmail = vi.fn();
const resend = vi.fn();
const updateUser = vi.fn();
const getUser = vi.fn();
const signInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseUserClient: vi.fn(async () => ({
    auth: {
      signUp,
      resetPasswordForEmail,
      resend,
      updateUser,
      getUser,
      signInWithOAuth,
    },
  })),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/modules/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/modules/auth/session')>(
    '@/modules/auth/session',
  );
  return {
    ...actual,
    getVerifiedUser: vi.fn(async () => null),
  };
});

describe('forgot-password route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it('returns an enumeration-safe message even when Supabase errors', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { message: 'User not found' },
    });
    const { POST } = await import('@/app/api/auth/forgot-password/route');
    const res = await POST(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'missing@example.com' }),
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/if that email is registered/i);
  });
});

describe('resend-verification route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resend.mockResolvedValue({ error: null });
  });

  it('returns an enumeration-safe message', async () => {
    const { POST } = await import('@/app/api/auth/resend-verification/route');
    const res = await POST(
      new Request('http://localhost/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ada@example.com' }),
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatch(/if that email needs verification/i);
  });
});

describe('update-password route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when there is no verified recovery session', async () => {
    const { getVerifiedUser } = await import('@/modules/auth/session');
    vi.mocked(getVerifiedUser).mockResolvedValue(null);

    const { POST } = await import('@/app/api/auth/update-password/route');
    const res = await POST(
      new Request('http://localhost/api/auth/update-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'password1' }),
      }) as never,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid or has expired/i);
  });
});
