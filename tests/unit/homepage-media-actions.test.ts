import { describe, it, expect, vi, beforeEach } from 'vitest';

// Control the server-verified identity that requireAdmin() reads.
vi.mock('@/modules/auth/session', () => ({ getAuthContext: vi.fn() }));

import { getAuthContext } from '@/modules/auth/session';
import { updateHomepageAltAction } from '@/modules/homepage-media/actions';
import { isHomepageSlot } from '@/modules/homepage-media/slots';

const asMock = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe('updateHomepageAltAction — admin authorization', () => {
  beforeEach(() => asMock.mockReset());

  it('denies an unauthenticated caller (401)', async () => {
    asMock.mockResolvedValue(null);
    const r = await updateHomepageAltAction('hero', 'A rack of dresses');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it('denies an authenticated non-admin (seller) (403)', async () => {
    asMock.mockResolvedValue({
      userId: 's1',
      email: 's@example.com',
      roles: ['buyer', 'seller'],
    });
    const r = await updateHomepageAltAction('hero', 'A rack of dresses');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it('takes NO client identity — only (slot, alt) — so admin cannot be spoofed', () => {
    // The action signature carries no userId/role; identity is server-derived.
    expect(updateHomepageAltAction.length).toBe(2);
  });

  it('an admin with an invalid slot is rejected before any write (400)', async () => {
    asMock.mockResolvedValue({
      userId: 'a1',
      email: 'a@example.com',
      roles: ['admin'],
    });
    const r = await updateHomepageAltAction('not-a-slot', 'valid alt');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toBe('invalid_slot');
    }
  });

  it('an admin with empty alt is rejected before any write (400)', async () => {
    asMock.mockResolvedValue({
      userId: 'a1',
      email: 'a@example.com',
      roles: ['admin'],
    });
    const r = await updateHomepageAltAction('hero', '   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

describe('isHomepageSlot — closed set of the five fixed slots', () => {
  it('accepts exactly the five slots and rejects anything else', () => {
    for (const s of ['hero', 'inside_1', 'inside_2', 'inside_3', 'story']) {
      expect(isHomepageSlot(s)).toBe(true);
    }
    for (const s of ['', 'inside_4', 'HERO', 'admin', '../etc', 42, null]) {
      expect(isHomepageSlot(s)).toBe(false);
    }
  });
});
