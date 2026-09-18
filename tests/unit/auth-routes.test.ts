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

describe('register route (enumeration-safe duplicate handling)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signUp.mockResolvedValue({ data: { user: null }, error: null });
  });

  async function register(body: unknown) {
    const { POST } = await import('@/app/api/auth/register/route');
    return POST(
      new Request('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }) as never,
    );
  }

  const valid = {
    email: 'new@example.com',
    password: 'password1',
    displayName: 'New User',
  };

  it('new email → 200 with the enumeration-safe verification message', async () => {
    const res = await register(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/check your email/i);
    expect(signUp).toHaveBeenCalledTimes(1);
  });

  it('existing email → identical response, whether Supabase obscures or errors', async () => {
    // Confirmation-enabled Supabase obscures duplicates (no error); even if a
    // duplicate error were returned, the route must respond identically to the
    // new-email case so account existence cannot be probed.
    signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    const res = await register({ ...valid, email: 'existing@example.com' });
    expect(res.status).toBe(200);
    expect((await res.json()).message).toMatch(/check your email/i);
  });

  it('never leaks the duplicate/internal reason to the client', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    const res = await register({ ...valid, email: 'existing@example.com' });
    expect(JSON.stringify(await res.json())).not.toMatch(/already registered/i);
  });

  it('malformed email → 400 validation, without calling the provider', async () => {
    const res = await register({ ...valid, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('unexpected Supabase failure → generic safe 200 (still enumeration-safe)', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { message: 'kaboom internal detail' },
    });
    const res = await register(valid);
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toMatch(/kaboom/i);
  });

  it('submitting twice with the same email creates no route-side records', async () => {
    // The route only calls Supabase Auth signUp; the application profile + buyer
    // role are provisioned idempotently on first login, never here — so a repeat
    // signup cannot create a duplicate profile.
    await register({ ...valid, email: 'dupe@example.com' });
    const res = await register({ ...valid, email: 'dupe@example.com' });
    expect(res.status).toBe(200);
    expect(signUp).toHaveBeenCalledTimes(2);
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
