import Link from 'next/link';
import { getAuthContext } from '@/modules/auth/session';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { buildHeaderNav } from './nav-model';
import { Wordmark } from './Wordmark';
import { SearchField } from './SearchField';
import { AccountMenu } from './AccountMenu';
import { MobileNav } from './MobileNav';
import { IconButton } from '@/components/ui/IconButton';
import { HeartIcon, MessageIcon } from './icons';

/**
 * Production header — sticky, blurred, warm-bordered (prototype `header`).
 *
 * SERVER AUTHORITATIVE: identity comes exclusively from `getAuthContext()`
 * (Supabase-verified user + RLS-loaded roles). Client components below this
 * only receive pre-computed navigation links; they cannot escalate anything
 * because every destination re-runs its own server guard.
 */
export async function SiteHeader() {
  // TRUTHFUL configuration-blocked behaviour: when Supabase is not yet
  // configured, no session can exist, so the logged-out header is the true
  // state. This never simulates authentication — it only avoids crashing
  // the shell in an environment without credentials.
  const ctx = isSupabaseConfigured() ? await getAuthContext() : null;
  const nav = buildHeaderNav({
    authenticated: ctx !== null,
    email: ctx?.email ?? null,
    roles: ctx?.roles ?? [],
  });

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
