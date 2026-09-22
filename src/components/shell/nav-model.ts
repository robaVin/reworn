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

/**
 * Localized label lookup, injected by the caller (SiteHeader passes
 * `getTranslations('Nav')`). Injecting it keeps this module pure and
 * synchronously unit-testable — tests pass an identity `(key) => key`.
 */
export type NavTranslator = (key: string) => string;

export function buildHeaderNav(
  identity: NavIdentity,
  t: NavTranslator,
): HeaderNav {
  const { authenticated, email, roles } = identity;

  const saved: NavLink = {
    label: t('saved'),
    href: authenticated ? '/saved' : loginWithNext('/saved'),
  };
  const messages: NavLink = {
    label: t('messages'),
    href: authenticated ? '/messages' : loginWithNext('/messages'),
  };
  const sell: NavLink = {
    // Canonical seller entry for EVERY user state. The /sell server route
    // decides the destination (login, onboarding, profile-required,
    // subscription-required, or create-a-listing) from the verified user — the
    // client never decides.
    label: t('sell'),
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
        { label: t('login'), href: '/login' },
        { label: t('register'), href: '/register' },
      ],
      showLogout: false,
    };
  }

  const menu: NavLink[] = [];
  if (canActAsSeller(roles)) {
    // Consolidated: Seller Studio is the single seller entry in the dropdown.
    // Listings and Subscription are reached from the dashboard ("View all
    // listings" / "Manage subscription"); their routes remain live and each
    // still re-enforces requireAnyRolePage(['seller','admin']). The Nav.listings
    // and Nav.subscription i18n keys are intentionally retained.
    menu.push({ label: t('sellerDashboard'), href: '/seller' });
  }
  menu.push(
    { label: t('messages'), href: '/messages' },
    { label: t('account'), href: '/account' },
    { label: t('saved'), href: '/saved' },
  );
  if (isAdmin(roles)) {
    menu.push({ label: t('admin'), href: '/admin' });
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
