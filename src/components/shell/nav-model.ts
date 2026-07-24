import { canActAsSeller, isAdmin, type Role } from '@/modules/auth/roles';

/**
 * Pure header-navigation model.
 *
 * SECURITY: this only shapes NAVIGATION built from the server-verified auth
 * context (SiteHeader passes `getAuthContext()` output). It is presentation,
 * not authorization — every destination independently enforces its own
 * server-side guard, so a wrong link here can never grant access.
 *
 * Dependency-free and pure so the role→navigation rules are unit-testable
 * (see tests/unit/header-nav.test.ts).
 */

export interface NavIdentity {
  authenticated: boolean;
  email: string | null;
  roles: readonly Role[];
}

export interface NavLink {
  label: string;
  href: string;
}

export interface HeaderNav {
  authenticated: boolean;
  email: string | null;
  /** Heart icon action. Logged out → login preserving the destination. */
  saved: NavLink;
  /** Messages icon action. Logged out → login preserving the destination. */
  messages: NavLink;
  /** "Sell an item" CTA. Sellers/admins → dashboard; others → public entry. */
  sell: NavLink;
  /** Account menu entries (auth entry points when logged out). */
  menu: NavLink[];
  /** Whether the menu should append a logout action. */
  showLogout: boolean;
}

function loginWithNext(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export function buildHeaderNav(identity: NavIdentity): HeaderNav {
  const { authenticated, email, roles } = identity;

  const saved: NavLink = {
    label: 'Saved items',
    href: authenticated ? '/saved' : loginWithNext('/saved'),
  };
  const messages: NavLink = {
    label: 'Messages',
    href: authenticated ? '/messages' : loginWithNext('/messages'),
  };
  const sell: NavLink = {
    // Canonical seller entry for EVERY user state. The /sell server route
    // decides the destination (login, onboarding, profile-required,
    // subscription-required, or create-a-listing) from the verified user — the
    // client never decides.
    label: 'Sell an item',
    href: '/sell',
  };

  if (!authenticated) {
    return {
      authenticated: false,
      email: null,
      saved,
      messages,
      sell,
      menu: [
        { label: 'Log in', href: '/login' },
        { label: 'Create account', href: '/register' },
      ],
      showLogout: false,
    };
  }

  const menu: NavLink[] = [];
  if (canActAsSeller(roles)) {
    // Seller destinations: truthful shells until Increment #6 / catalog.
    // Every destination re-enforces requireAnyRolePage(['seller','admin']).
    menu.push(
      { label: 'Seller dashboard', href: '/seller' },
      { label: 'Listings', href: '/seller/listings' },
      { label: 'Subscription', href: '/seller/subscription' },
    );
  }
  menu.push(
    { label: 'Messages', href: '/messages' },
    { label: 'Account', href: '/account' },
    { label: 'Saved items', href: '/saved' },
  );
  if (isAdmin(roles)) {
    menu.push({ label: 'Admin', href: '/admin' });
  }

  return {
    authenticated: true,
    email,
    saved,
    messages,
    sell,
    menu,
    showLogout: true,
  };
}
