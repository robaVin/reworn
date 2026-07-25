'use server';

import { requireAnyRole } from '@/modules/auth/guards';
import {
  draftListingSchema,
  updateListingSchema,
  listingTransitionSchema,
} from './schemas';
import {
  createDraftListing,
  updateListing,
  transitionListing,
} from './listing-service';
import {
  actionOk,
  toActionError,
  actionFail,
  type ActionResult,
} from './action-result';

/**
 * Listing mutation server actions — the server-authoritative surface consumed
 * by the seller UI (Increment 2B+). Every action re-verifies the seller role
 * server-side and validates input with Zod; ownership + entitlement are
 * enforced in the service. Server Actions are CSRF-protected by Next.js.
 *
 * There is no browser-only entitlement check anywhere.
 */

export async function createListingAction(
  input: unknown,
  bootstrapKey?: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    const parsed = draftListingSchema.safeParse(input);
    if (!parsed.success) {
      return actionFail(400, 'validation', parsed.error.flatten().fieldErrors);
    }
    // The bootstrap key is an opaque UUID from the form session; validate its
    // shape and ignore anything malformed (falls back to a plain create).
    const key =
      typeof bootstrapKey === 'string' && /^[0-9a-f-]{36}$/i.test(bootstrapKey)
        ? bootstrapKey
        : undefined;
    const listing = await createDraftListing(ctx.userId, parsed.data, {
      bootstrapKey: key,
    });
    return actionOk({ id: listing.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateListingAction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    const parsed = updateListingSchema.safeParse(input);
    if (!parsed.success) {
      return actionFail(400, 'validation', parsed.error.flatten().fieldErrors);
    }
    const listing = await updateListing(ctx.userId, id, parsed.data);
    return actionOk({ id: listing.id });
  } catch (error) {
    return toActionError(error);
  }
}

export async function transitionListingAction(
  id: string,
  action: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    const ctx = await requireAnyRole(['seller', 'admin']);
    const parsed = listingTransitionSchema.safeParse(action);
    if (!parsed.success) {
      return actionFail(400, 'invalid_transition');
    }
    const listing = await transitionListing(ctx.userId, id, parsed.data);
    return actionOk({ id: listing.id, status: listing.status });
  } catch (error) {
    return toActionError(error);
  }
}
