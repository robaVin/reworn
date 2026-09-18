'use server';

import { cookies } from 'next/headers';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { getAuthContext } from '@/modules/auth/session';
import { prisma } from '@/lib/db';

/**
 * Persist the selected UI locale.
 *
 * The `NEXT_LOCALE` cookie is the per-request source of truth (read by
 * next-intl in src/i18n/request.ts). For signed-in users we ALSO write the
 * existing `Profile.locale` column (no migration — the field already exists) so
 * the preference is durable across devices. That write is best-effort: the
 * cookie alone is sufficient for the switch to take effect, and switching never
 * touches the session (the user stays logged in).
 *
 * Only a known locale is accepted; anything else is ignored (fail closed).
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // one year
    sameSite: 'lax',
  });

  try {
    const ctx = await getAuthContext();
    if (ctx) {
      await prisma.profile.update({
        where: { id: ctx.userId },
        data: { locale },
      });
    }
  } catch {
    // Durable persistence is best-effort; the cookie is authoritative.
  }
}
