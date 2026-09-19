'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';

/**
 * Logout control — posts to the real /api/auth/logout route, then does a
 * full navigation so every server component re-reads the (now absent) session.
 * Idempotent for already-expired sessions.
 */
export function LogoutButton({
  variant = 'outline',
}: {
  variant?: 'primary' | 'outline' | 'ghost';
}) {
  const tNav = useTranslations('Nav');
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Server is idempotent; reload re-syncs real session state either way.
    }
    window.location.assign('/');
  }

  return (
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={pending}
    >
      {pending ? tNav('loggingOut') : tNav('logout')}
    </Button>
  );
}
