import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * updateDisplayNameAction — the signed-in user edits ONLY their own profile.
 * Authorization comes from the server-verified session (never a client id);
 * these tests pin the 401/validation paths and the exact write (set vs clear).
 */

const getAuthContext = vi.fn();
vi.mock('@/modules/auth/session', () => ({
  getAuthContext: () => getAuthContext(),
}));

const update = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: { profile: { update: (...a: unknown[]) => update(...a) } },
}));

import { updateDisplayNameAction } from '@/modules/auth/account-actions';

describe('updateDisplayNameAction', () => {
  beforeEach(() => {
    getAuthContext.mockReset();
    update.mockReset().mockResolvedValue({});
  });

  it('rejects an unauthenticated caller (401) and writes nothing', async () => {
    getAuthContext.mockResolvedValue(null);
    const r = await updateDisplayNameAction('Nova');
    expect(r).toMatchObject({ ok: false, status: 401 });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a too-long name (400) and writes nothing', async () => {
    getAuthContext.mockResolvedValue({ userId: 'u1', email: null, roles: [] });
    const r = await updateDisplayNameAction('x'.repeat(81));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it('sets a trimmed display name for the verified user', async () => {
    getAuthContext.mockResolvedValue({ userId: 'u2', email: null, roles: [] });
    const r = await updateDisplayNameAction('  Nova  ');
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { displayName: 'Nova' },
    });
  });

  it('clears the display name when blank (-> null)', async () => {
    getAuthContext.mockResolvedValue({ userId: 'u3', email: null, roles: [] });
    const r = await updateDisplayNameAction('   ');
    expect(r.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'u3' },
      data: { displayName: null },
    });
  });
});
