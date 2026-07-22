import { describe, expect, it } from 'vitest';
import { buildHeaderNav } from '@/components/shell/nav-model';

/**
 * Header navigation model — presentation of the server-verified auth
 * context. These tests pin the role→navigation rules:
 *  - admin entries never appear for non-admins
 *  - seller entries appear for seller OR admin (operational override)
 *  - logged-out users are routed to /login with a safe internal `next`
 * (Authorization itself is enforced per-route by the server guards and is
 * tested separately in guards.test.ts / authorization.test.ts.)
 */

const loggedOut = { authenticated: false, email: null, roles: [] as const };

describe('buildHeaderNav — logged out', () => {
  it('sends saved/messages through login preserving the destination', () => {
    const nav = buildHeaderNav(loggedOut);
    expect(nav.saved.href).toBe('/login?next=%2Fsaved');
    expect(nav.messages.href).toBe('/login?next=%2Fmessages');
  });

  it('offers only auth entry points in the menu, without logout', () => {
    const nav = buildHeaderNav(loggedOut);
    expect(nav.menu.map((l) => l.href)).toEqual(['/login', '/register']);
    expect(nav.showLogout).toBe(false);
  });

  it('routes the sell CTA to the public start-selling entry', () => {
    expect(buildHeaderNav(loggedOut).sell.href).toBe('/sell');
  });
});

describe('buildHeaderNav — buyer', () => {
  const buyer = {
    authenticated: true,
    email: 'b@example.com',
    roles: ['buyer'] as const,
  };

  it('shows messages, account and saved items, with logout', () => {
    const nav = buildHeaderNav(buyer);
    expect(nav.menu.map((l) => l.href)).toEqual([
      '/messages',
      '/account',
      '/saved',
    ]);
    expect(nav.showLogout).toBe(true);
  });

  it('never shows seller or admin entries', () => {
    const hrefs = buildHeaderNav(buyer).menu.map((l) => l.href);
    expect(hrefs).not.toContain('/seller');
    expect(hrefs).not.toContain('/admin');
  });

  it('routes the sell CTA to the public entry (no seller role)', () => {
    expect(buildHeaderNav(buyer).sell.href).toBe('/sell');
  });
});

describe('buildHeaderNav — seller', () => {
  const seller = {
    authenticated: true,
    email: 's@example.com',
    roles: ['buyer', 'seller'] as const,
  };

  it('adds dashboard, listings and subscription but not admin', () => {
    const hrefs = buildHeaderNav(seller).menu.map((l) => l.href);
    expect(hrefs.slice(0, 3)).toEqual([
      '/seller',
      '/seller/listings',
      '/seller/subscription',
    ]);
    expect(hrefs).not.toContain('/admin');
  });

  it('routes the sell CTA straight to the dashboard', () => {
    expect(buildHeaderNav(seller).sell.href).toBe('/seller');
  });
});

describe('buildHeaderNav — admin', () => {
  const admin = {
    authenticated: true,
    email: 'a@example.com',
    roles: ['buyer', 'admin'] as const,
  };

  it('shows the admin entry only for verified admins', () => {
    expect(buildHeaderNav(admin).menu.map((l) => l.href)).toContain('/admin');
  });

  it('lets admins operate seller tooling (canActAsSeller rule)', () => {
    const nav = buildHeaderNav(admin);
    expect(nav.menu.map((l) => l.href)).toContain('/seller');
    expect(nav.sell.href).toBe('/seller');
  });
});

describe('buildHeaderNav — authenticated linking', () => {
  it('links saved/messages directly when authenticated', () => {
    const nav = buildHeaderNav({
      authenticated: true,
      email: 'b@example.com',
      roles: ['buyer'] as const,
    });
    expect(nav.saved.href).toBe('/saved');
    expect(nav.messages.href).toBe('/messages');
  });
});
