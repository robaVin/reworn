'use server';

import { z } from 'zod';
import { requireUser } from '@/modules/auth/guards';
import { enforceActionRateLimit } from '@/lib/security/rate-limit';
import { saveListing, unsaveListing } from './service';
import {
  actionOk,
  actionFail,
  toActionError,
  type ActionResult,
} from '@/modules/catalog/action-result';

/**
 * Saved-items server actions — the server-authoritative surface for save/unsave.
 * Every action re-verifies the authenticated user server-side; the identity is
 * ALWAYS `ctx.userId` (never a client-supplied id). Only the `listingId` is
 * accepted from the browser, validated as a UUID. Server Actions are
 * CSRF-protected by Next.js; a per-user rate limit caps scripted abuse.
 */

const listingIdSchema = z.string().uuid();

export async function saveListingAction(
  listingId: unknown,
): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const ctx = await requireUser();
    enforceActionRateLimit('savedItemWrite', ctx.userId);
    const parsed = listingIdSchema.safeParse(listingId);
    if (!parsed.success) return actionFail(400, 'invalid_listing');
    const res = await saveListing(ctx.userId, parsed.data);
    return actionOk(res);
  } catch (error) {
    return toActionError(error);
  }
}

export async function unsaveListingAction(
  listingId: unknown,
): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const ctx = await requireUser();
    enforceActionRateLimit('savedItemWrite', ctx.userId);
    const parsed = listingIdSchema.safeParse(listingId);
    if (!parsed.success) return actionFail(400, 'invalid_listing');
    const res = await unsaveListing(ctx.userId, parsed.data);
    return actionOk(res);
  } catch (error) {
    return toActionError(error);
  }
}
