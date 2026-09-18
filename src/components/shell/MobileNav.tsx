'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { HeaderNav } from './nav-model';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { LanguageSelector } from './LanguageSelector';
import { CloseIcon, HeartIcon, MenuIcon, MessageIcon } from './icons';

/**
 * Mobile navigation drawer. Links are computed server-side (SiteHeader);
 * this component only presents them. Focus trapping, Escape dismissal and
 * focus restoration come from the native <dialog> underneath.
 *
 * The drawer auto-closes when the viewport crosses the `md` breakpoint so
 * an open dialog cannot linger (and trap focus) after the trigger is hidden.
 */
export function MobileNav({ nav }: { nav: HeaderNav }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Idempotent; the reload below re-syncs real session state.
    }
    window.location.assign('/');
  }

  const linkClasses =
    'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-ink hover:bg-sand';

  return (
    <div className="md:hidden">
      <IconButton label="Open navigation" onClick={() => setOpen(true)}>
        <MenuIcon />
      </IconButton>

      <Dialog open={open} onClose={close} label="Navigation" variant="drawer">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="font-display text-lg font-bold">Menu</p>
          <IconButton label="Close navigation" onClick={close}>
            <CloseIcon />
          </IconButton>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
          <div>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Marketplace
            </p>
            <Link href="/browse" onClick={close} className={linkClasses}>
              Browse the edit
            </Link>
            <Link href={nav.sell.href} onClick={close} className={linkClasses}>
              {nav.sell.label}
            </Link>
            <Link href={nav.saved.href} onClick={close} className={linkClasses}>
              <HeartIcon className="h-[18px] w-[18px]" />
              {nav.saved.label}
            </Link>
            <Link
              href={nav.messages.href}
              onClick={close}
              className={linkClasses}
            >
              <MessageIcon className="h-[18px] w-[18px]" />
              {nav.messages.label}
            </Link>
          </div>

          <div>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Account
            </p>
            {nav.authenticated && nav.email && (
              <p className="truncate px-3 pb-2 text-xs text-muted">
                Signed in as{' '}
                <span className="font-semibold text-ink">{nav.email}</span>
              </p>
            )}
            {nav.menu.map((link) => (
              <Link
                key={`${link.label}:${link.href}`}
                href={link.href}
                onClick={close}
                className={linkClasses}
              >
                {link.label}
              </Link>
            ))}
            {nav.showLogout && (
              <button
                type="button"
                onClick={onLogout}
                disabled={loggingOut}
                className={`${linkClasses} w-full text-left disabled:opacity-60`}
              >
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            )}
          </div>

          <div className="px-3">
            <LanguageSelector className="block" />
          </div>
        </nav>
      </Dialog>
    </div>
  );
}
