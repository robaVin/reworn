'use server';

import { z } from 'zod';
import { getAuthContext } from '@/modules/auth/session';
import { prisma } from '@/lib/db';
import { enforceActionRateLimit } from '@/lib/security/rate-limit';
import {
  actionOk,
  actionFail,
  toActionError,
  type ActionResult,
} from '@/modules/catalog/action-result';

/**
 * Account server actions for the signed-in user.
 *
 * Authorization is server-authoritative: the target is ALWAYS the verified
 * user's own profile (`getAuthContext().userId`) — never a client-supplied id —
 * so a user can only ever edit their own record. CSRF-protected by Next.js
 * Server Actions; rate-limited per user. No role or client state is trusted.
 */

/** Trimmed, max 80 chars. Empty clears the name (-> NULL, "галерија member"). */
const displayNameSchema = z.string().trim().max(80);

export async function updateDisplayNameAction(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const auth = await getAuthContext();
  if (!auth) return actionFail(401, 'unauthorized');

  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) return actionFail(400, 'invalid');

  try {
    enforceActionRateLimit('profileWrite', auth.userId);
    const value = parsed.data.length > 0 ? parsed.data : null;
    await prisma.profile.update({
      where: { id: auth.userId },
      data: { displayName: value },
    });
    return actionOk(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
