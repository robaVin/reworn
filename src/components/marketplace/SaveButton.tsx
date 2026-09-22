'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import {
  saveListingAction,
  unsaveListingAction,
} from '@/modules/saved/actions';

/**
 * Save / unsave (wishlist) heart. The ONE save control, reused on listing cards
 * and the published PDP.
 *
 * - Anonymous: a real link to the existing login flow, preserving a SAFE
 *   internal return path (`/login?next=…`); no client user id, no fake success.
 * - Authenticated: an accessible toggle button. State is optimistic and REVERTS
 *   on failure, so the heart never claims a save that didn't happen. The action
 *   receives only the listing id; identity comes from the server session.
 *
 * State is conveyed by shape (filled vs outline heart), `aria-pressed`, and a
 * localized `aria-label` — never colour alone.
 */
const HEART_PATH =
  'M12 21s-8-5.3-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.7-8 11-8 11z';

export function SaveButton({
  listingId,
  initialSaved,
  authenticated,
  returnPath,
  className,
}: {
  listingId: string;
  initialSaved: boolean;
  authenticated: boolean;
  /** Internal path to return to after login (anonymous flow). */
  returnPath: string;
  className?: string;
}) {
  const t = useTranslations('Favorites');
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  const base = cn(
    'grid h-10 w-10 place-items-center rounded-full border border-line',
    'bg-cream/85 text-ink shadow-soft backdrop-blur-sm transition-colors',
    'hover:bg-cream focus:outline-none focus-visible:ring-2',
    'focus-visible:ring-terracotta-strong disabled:opacity-60',
    className,
  );

  const heart = (fill: boolean) => (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-5 w-5', fill ? 'text-terracotta-strong' : 'text-ink')}
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={fill ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={HEART_PATH} />
    </svg>
  );

  // Anonymous: send to login with a validated internal return path. Rendered as
  // a link so it is keyboard-operable and needs no client JS.
  if (!authenticated) {
    const href = `/login?next=${encodeURIComponent(returnPath)}`;
    return (
      <a
        href={href}
        aria-label={t('saveAria')}
        className={base}
        // Sits over a card <Link>; stop the click from following the card too.
        onClick={(e) => e.stopPropagation()}
      >
        {heart(false)}
      </a>
    );
  }

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !saved;
    setSaved(next); // optimistic
    startTransition(async () => {
      const res = next
        ? await saveListingAction(listingId)
        : await unsaveListingAction(listingId);
      if (!res.ok) setSaved(!next); // revert on failure — never fake success
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-busy={pending}
      aria-label={saved ? t('removeAria') : t('saveAria')}
      title={
        pending
          ? saved
            ? t('saving')
            : t('removing')
          : saved
            ? t('saved')
            : t('saveAria')
      }
      className={base}
    >
      {heart(saved)}
    </button>
  );
}
