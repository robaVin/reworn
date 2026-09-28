'use server';

import { z } from 'zod';
import type { HomepageSlot } from '@prisma/client';
import { requireAdmin } from '@/modules/auth/guards';
import { enforceActionRateLimit } from '@/lib/security/rate-limit';
import { updateHomepageAlt } from './service';
import { HOMEPAGE_SLOTS } from './slots';
import {
  actionOk,
  actionFail,
  toActionError,
  type ActionResult,
} from '@/modules/catalog/action-result';

/**
 * Homepage-media server actions. Image replacement goes through the raw-body
 * admin route (to stream large uploads); this action changes ONLY the alt text
 * of an existing override. It independently re-verifies the admin role
 * server-side — never trusting a client-supplied identity or role — and is
 * CSRF-protected by Next.js Server Actions.
 */

const slotSchema = z.enum(HOMEPAGE_SLOTS);
const altSchema = z.string().trim().min(1).max(300);

export async function updateHomepageAltAction(
  slot: unknown,
  alt: unknown,
): Promise<ActionResult<undefined>> {
  try {
    const ctx = await requireAdmin();
    enforceActionRateLimit('adminMediaWrite', ctx.userId);
    const parsedSlot = slotSchema.safeParse(slot);
    const parsedAlt = altSchema.safeParse(alt);
    if (!parsedSlot.success) return actionFail(400, 'invalid_slot');
    if (!parsedAlt.success) return actionFail(400, 'invalid_alt');
    await updateHomepageAlt(
      ctx.userId,
      parsedSlot.data as HomepageSlot,
      parsedAlt.data,
    );
    return actionOk(undefined);
  } catch (error) {
    return toActionError(error);
  }
}
