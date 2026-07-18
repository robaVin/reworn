import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext } from '@/modules/auth/authorization';

/**
 * Guard wiring: verifies the server guards translate the loaded auth context
 * into allow / AuthorizationError, WITHOUT a database or Supabase. The session
 * loader is mocked, so this also stands in for "invalid/expired session → 401"
 * (an invalid session makes getAuthContext resolve null).
 */
vi.mock('@/modules/auth/session', () => ({
  getAuthContext: vi.fn(),
}));

import { getAuthContext } from '@/modules/auth/session';
import {
  requireUser,
  requireRole,
  requireAnyRole,
  requireAdmin,
  requireOwnership,
  AuthorizationError,
} from '@/modules/auth/guards';

const mockedGetAuthContext = vi.mocked(getAuthContext);

const buyer: AuthContext = { userId: 'u1', email: null, roles: ['buyer'] };
const admin: AuthContext = {
  userId: 'a1',
  email: null,
  roles: ['buyer', 'admin'],
};

beforeEach(() => {
  mockedGetAuthContext.mockReset();
});

describe('server guards', () => {
  it('requireUser rejects an invalid/expired session with 401', async () => {
    mockedGetAuthContext.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    await expect(requireUser()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('requireUser returns the context for a valid session', async () => {
    mockedGetAuthContext.mockResolvedValue(buyer);
    await expect(requireUser()).resolves.toEqual(buyer);
  });

  it('requireRole: buyer denied seller (403)', async () => {
    mockedGetAuthContext.mockResolvedValue(buyer);
    await expect(requireRole('seller')).rejects.toMatchObject({ status: 403 });
  });

  it('requireAnyRole: buyer denied [seller, admin] (403)', async () => {
    mockedGetAuthContext.mockResolvedValue(buyer);
    await expect(requireAnyRole(['seller', 'admin'])).rejects.toMatchObject({
      status: 403,
    });
  });

  it('requireAdmin: buyer 403, admin allowed', async () => {
    mockedGetAuthContext.mockResolvedValue(buyer);
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    mockedGetAuthContext.mockResolvedValue(admin);
    await expect(requireAdmin()).resolves.toEqual(admin);
  });

  it('requireOwnership: non-owner hidden as 404', async () => {
    mockedGetAuthContext.mockResolvedValue(buyer);
    await expect(requireOwnership('someone-else')).rejects.toMatchObject({
      status: 404,
    });
    await expect(requireOwnership('u1')).resolves.toEqual(buyer);
  });
});
