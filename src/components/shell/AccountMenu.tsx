'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { NavLink } from './nav-model';
import { IconButton } from '@/components/ui/IconButton';
import { UserIcon } from './icons';

/**
 * Account dropdown (desktop header).
 *
 * Receives its links pre-computed by the SERVER (SiteHeader →
 * buildHeaderNav from the verified auth context). This component only
 * presents them — it never derives permissions client-side, and every
 * destination re-enforces its own server guard.
 *
 * Keyboard behaviour: Enter/Space/ArrowDown open and focus the first item,
 * Arrow keys cycle, Escape closes and restores focus to the trigger,
 * focus/click outside closes.
 */
export interface AccountMenuProps {
  authenticated: boolean;
  email: string | null;
  links: NavLink[];
  showLogout: boolean;
}

export function AccountMenu({
  authenticated,
  email,
  links,
  showLogout,
}: AccountMenuProps) {
  const t = useTranslations('Account');
  const tNav = useTranslations('Nav');
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) {
      // The trigger is the only direct <button> child of the root.
      rootRef.current
        ?.querySelector<HTMLButtonElement>(':scope > button')
        ?.focus();
    }
  }, []);

  // Close on click or focus outside.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    function onFocusIn(e: FocusEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open, close]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) {
      const first =
        listRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(index - 1 + items.length) % items.length]?.focus();
    }
  }

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Idempotent server-side; a network failure still falls through to a
      // full reload, which re-syncs the real session state.
    }
    // Full navigation so every server component re-renders with the
    // (now absent) session.
    window.location.assign('/');
  }

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        label={authenticated ? t('menuLabelAuthed') : t('menuLabelGuest')}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <UserIcon />
      </IconButton>

      {open && (
        <div
          ref={listRef}
          role="menu"
          aria-label={tNav('account')}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-card border border-line bg-surface p-2 shadow-lift"
        >
          {authenticated && email && (
            <p className="truncate border-b border-line px-3 pb-2 pt-1 text-xs text-muted">
              {tNav('signedInAs')}{' '}
              <span className="font-semibold text-ink">{email}</span>
            </p>
          )}
          <div className="py-1">
            {links.map((link) => (
              <Link
                key={`${link.label}:${link.href}`}
                href={link.href}
                role="menuitem"
                onClick={() => close()}
                className="block rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-sand"
              >
                {link.label}
              </Link>
            ))}
          </div>
          {showLogout && (
            <div className="border-t border-line pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={onLogout}
                disabled={loggingOut}
                className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-ink hover:bg-sand disabled:opacity-60"
              >
                {loggingOut ? tNav('loggingOut') : tNav('logout')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
