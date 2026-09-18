import { Suspense } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getAuthContext } from '@/modules/auth/session';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { buildHeaderNav, type HeaderNav } from './nav-model';
import { Wordmark } from './Wordmark';
import { SearchField } from './SearchField';
import { AccountMenu } from './AccountMenu';
import { MobileNav } from './MobileNav';
import { LanguageSelector } from './LanguageSelector';
import { IconButton } from '@/components/ui/IconButton';
import { HeartIcon, MessageIcon } from './icons';

/**
 * Production header — sticky, blurred, warm-bordered (prototype `header`).
 *
 * SERVER AUTHORITATIVE: identity comes exclusively from `getAuthContext()`
 * (Supabase-verified user + RLS-loaded roles). Client components below only
 * receive pre-computed navigation links; they cannot escalate anything because
 * every destination re-runs its own server guard.
 *
 * A1 (streaming): the auth-dependent part (`HeaderContent`) resolves inside a
 * Suspense boundary so the page SHELL streams immediately without waiting on the
 * auth round-trip. The fallback renders the SAME header bar with LOGGED-OUT
 * chrome — identical layout (no shift), and it carries NO trust: authorization
 * is enforced per route/mutation and by RLS, never by this fallback.
 */
export async function SiteHeader() {
  const t = await getTranslations('Nav');
  const anonymousNav = buildHeaderNav(
    { authenticated: false, email: null, roles: [] },
    t,
  );
  return (
    <Suspense fallback={<HeaderBar nav={anonymousNav} />}>
      <HeaderContent />
    </Suspense>
  );
}

/** Auth-dependent header — resolved independently of the page shell. */
async function HeaderContent() {
  // TRUTHFUL configuration-blocked behaviour: when Supabase is not configured,
  // no session can exist, so the logged-out header is the true state.
  const [ctx, t] = await Promise.all([
    isSupabaseConfigured() ? getAuthContext() : Promise.resolve(null),
    getTranslations('Nav'),
  ]);
  const nav = buildHeaderNav(
    {
      authenticated: ctx !== null,
      email: ctx?.email ?? null,
      roles: ctx?.roles ?? [],
    },
    t,
  );
  return <HeaderBar nav={nav} />;
}

/** Presentational header bar — pure, so the shell fallback and the resolved
 * header share identical markup (no layout shift on swap). */
function HeaderBar({ nav }: { nav: HeaderNav }) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-shell items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-8 lg:px-10">
        <Wordmark />

        <SearchField />

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          <IconButton label={nav.saved.label} href={nav.saved.href}>
            <HeartIcon />
          </IconButton>
          <IconButton label={nav.messages.label} href={nav.messages.href}>
            <MessageIcon />
          </IconButton>
          <AccountMenu
            authenticated={nav.authenticated}
            email={nav.email}
            links={nav.menu}
            showLogout={nav.showLogout}
          />
          <LanguageSelector className="hidden lg:block" />
          <Link
            href={nav.sell.href}
            className="ml-1 inline-flex min-h-11 items-center rounded-control bg-terracotta-strong px-5 py-2.5 text-[13.5px] font-semibold text-cream transition-[transform,background-color] duration-300 hover:-translate-y-0.5 hover:bg-terracotta-hover motion-reduce:hover:translate-y-0"
          >
            {nav.sell.label}
          </Link>
        </div>

        {/* Mobile: everything lives in the drawer */}
        <MobileNav nav={nav} />
      </div>
    </header>
  );
}
