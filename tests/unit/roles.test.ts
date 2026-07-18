import { describe, it, expect } from 'vitest';
import {
  isRole,
  normalizeRoles,
  hasRole,
  hasAnyRole,
  isAdmin,
  canActAsSeller,
} from '@/modules/auth/roles';

describe('role helpers', () => {
  it('validates role strings', () => {
    expect(isRole('buyer')).toBe(true);
    expect(isRole('seller')).toBe(true);
    expect(isRole('admin')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole(123)).toBe(false);
  });

  it('normalizes, de-duplicates and drops invalid roles', () => {
    expect(normalizeRoles(['buyer', 'buyer', 'nope', 'admin', 7])).toEqual([
      'buyer',
      'admin',
    ]);
  });

  it('hasRole / hasAnyRole', () => {
    expect(hasRole(['buyer'], 'buyer')).toBe(true);
    expect(hasRole(['buyer'], 'admin')).toBe(false);
    expect(hasAnyRole(['seller'], ['seller', 'admin'])).toBe(true);
    expect(hasAnyRole(['buyer'], ['seller', 'admin'])).toBe(false);
  });

  it('isAdmin', () => {
    expect(isAdmin(['buyer', 'admin'])).toBe(true);
    expect(isAdmin(['buyer', 'seller'])).toBe(false);
  });

  it('canActAsSeller allows sellers and admins (operational override)', () => {
    expect(canActAsSeller(['seller'])).toBe(true);
    expect(canActAsSeller(['admin'])).toBe(true);
    expect(canActAsSeller(['buyer'])).toBe(false);
  });
});
