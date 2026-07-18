import { describe, it, expect } from 'vitest';
import {
  checkAuthenticated,
  checkRole,
  checkAnyRole,
  checkAdmin,
  checkOwnership,
  type AuthContext,
} from '@/modules/auth/authorization';

const buyer: AuthContext = { userId: 'u-buyer', email: null, roles: ['buyer'] };
const seller: AuthContext = {
  userId: 'u-seller',
  email: null,
  roles: ['buyer', 'seller'],
};
const admin: AuthContext = {
  userId: 'u-admin',
  email: null,
  roles: ['buyer', 'admin'],
};

describe('authorization decisions', () => {
  describe('authentication', () => {
    it('rejects an anonymous user with 401', () => {
      expect(checkAuthenticated(null)).toEqual({
        ok: false,
        status: 401,
        reason: 'unauthenticated',
      });
    });
    it('allows any authenticated user', () => {
      expect(checkAuthenticated(buyer).ok).toBe(true);
    });
  });

  describe('role checks', () => {
    it('401 for anonymous even when a role is required', () => {
      expect(checkRole(null, 'seller')).toMatchObject({ status: 401 });
    });
    it('403 when authenticated but missing the role', () => {
      expect(checkRole(buyer, 'seller')).toMatchObject({ status: 403 });
    });
    it('allows the exact role', () => {
      expect(checkRole(seller, 'seller').ok).toBe(true);
    });
    it('anyRole allows when one matches', () => {
      expect(checkAnyRole(seller, ['seller', 'admin']).ok).toBe(true);
    });
    it('anyRole 403 when none match', () => {
      expect(checkAnyRole(buyer, ['seller', 'admin'])).toMatchObject({
        status: 403,
      });
    });
    it('admin check: buyer 403, admin allowed', () => {
      expect(checkAdmin(buyer)).toMatchObject({ status: 403 });
      expect(checkAdmin(admin).ok).toBe(true);
    });
    it('a seller is NOT an admin', () => {
      expect(checkAdmin(seller)).toMatchObject({ status: 403 });
    });
  });

  describe('ownership (IDOR)', () => {
    it('allows the verified owner', () => {
      expect(checkOwnership(buyer, 'u-buyer').ok).toBe(true);
    });

    it('hides the resource (404) from a non-owner by default', () => {
      expect(checkOwnership(buyer, 'someone-else')).toMatchObject({
        status: 404,
      });
    });

    it('can return 403 instead when existence need not be hidden', () => {
      expect(
        checkOwnership(buyer, 'someone-else', { hideAsNotFound: false }),
      ).toMatchObject({ status: 403 });
    });

    it('admin may act on others only when allowAdmin is set', () => {
      expect(checkOwnership(admin, 'someone-else')).toMatchObject({
        status: 404,
      });
      expect(
        checkOwnership(admin, 'someone-else', { allowAdmin: true }).ok,
      ).toBe(true);
    });

    it('THE verified id is the ONLY identity considered — a client-supplied id cannot escalate', () => {
      // Model an attacker who is `u-buyer` but submits a body claiming to own
      // resource `victim-resource`. The guard compares the resource's true owner
      // (loaded server-side) against the VERIFIED ctx.userId only. There is no
      // parameter through which the attacker's claimed id enters the decision.
      const verifiedAttacker = buyer; // ctx.userId === 'u-buyer'
      const trueOwnerOfResource = 'victim-user';
      expect(
        checkOwnership(verifiedAttacker, trueOwnerOfResource),
      ).toMatchObject({ status: 404 });
    });
  });
});
