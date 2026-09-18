import 'server-only';

import { cache } from 'react';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { AuthorizationError } from '@/modules/auth/errors';
import { enforceActionRateLimit, RateLimitedError } from '@/lib/security/rate-limit';
import {
  getOrCreateConversationForListing,
  sendConversationMessage,
} from './service';
import { MessageRejectedError } from './errors';
import type { ConversationErrorKind } from './conversation-cta';
import type { SendErrorKind, SendMessageState } from './compose-state';

/**
 * Server-only core for the conversation-creation boundary, kept separate from
 * the `'use server'` action file so it is directly unit/integration testable
 * (pass a userId in; no request context, no `redirect()` side effect here).
 *
 * The action layer owns authentication, `redirect()`, and result mapping; the
 * messaging SERVICE owns listing visibility, ownership, participant derivation
 * and the atomic get-or-create. This module only orchestrates and never trusts
 * a client-supplied participant id — the only client input is the listing id.
 */

export type StartConversationOutcome =
  | { kind: 'redirect'; to: string; created?: boolean }
  | { kind: 'error'; error: ConversationErrorKind };

/** Maps a thrown domain error to a safe, id-free failure kind. */
export function mapConversationError(error: unknown): ConversationErrorKind {
  if (error instanceof RateLimitedError) return 'rateLimited';
  if (error instanceof AuthorizationError) {
    // 404 = missing / non-public / malformed (uniform, non-disclosing);
    // 403 = the seller's own listing.
    if (error.status === 404) return 'notFound';
    if (error.status === 403) return 'ownListing';
  }
  // Unexpected: log server-side (redaction strips any secrets) and surface a
  // generic kind. The raw error, SQL, and any ids never reach the caller.
  logger.error('conversation creation failed', { error });
  return 'unexpected';
}

/**
 * Resolve the outcome of a create-or-reuse request. Returns a redirect target
 * or a safe failure kind; it does NOT perform the redirect (the action does).
 *
 *  - missing/empty listing id  -> validationError (the form field was absent)
 *  - unauthenticated           -> redirect to sign-in, preserving a SAFE return
 *                                 path back to the listing (no conversation is
 *                                 created before auth completes)
 *  - malformed / non-public / unknown listing -> notFound (uniform)
 *  - seller's own listing      -> ownListing
 *  - otherwise                 -> redirect to /messages/[conversationId]
 */
export async function resolveStartConversation(
  userId: string | null,
  listingIdRaw: unknown,
): Promise<StartConversationOutcome> {
  if (typeof listingIdRaw !== 'string' || listingIdRaw.length === 0) {
    return { kind: 'error', error: 'validationError' };
  }
  const listingId = listingIdRaw;

  if (!userId) {
    // Bounce to sign-in with a validated internal return path. Never create a
    // conversation before authentication; never honour a client redirect.
    const next = safeRedirectPath(`/listing/${listingId}`, '/browse');
    return { kind: 'redirect', to: `/login?next=${encodeURIComponent(next)}` };
  }

  try {
    // Throttle per verified user (never a client value): caps scripted abuse
    // of the create-conversation boundary without blocking real usage.
    enforceActionRateLimit('conversationStart', userId);
    const { id, created } = await getOrCreateConversationForListing(
      userId,
      listingId,
    );
    return { kind: 'redirect', to: `/messages/${id}`, created };
  } catch (error) {
    return { kind: 'error', error: mapConversationError(error) };
  }
}

/* ------------------------------ send message ------------------------------ */

export type SendMessageOutcome =
  { kind: 'redirect'; to: string } | { kind: 'error'; error: SendErrorKind };

/** Maps a thrown domain error to a safe, id-free send-failure kind. */
export function mapSendError(error: unknown): SendErrorKind {
  if (error instanceof MessageRejectedError) {
    switch (error.reason) {
      case 'empty':
        return 'empty';
      case 'too_long':
        return 'tooLong';
      case 'control_char':
        return 'controlChar';
      default:
        return 'validationError';
    }
  }
  if (error instanceof RateLimitedError) return 'rateLimited';
  if (error instanceof AuthorizationError && error.status === 404) {
    return 'notFound';
  }
  logger.error('message send failed', { error });
  return 'unexpected';
}

/**
 * Resolve the outcome of a send. Delegates ALL domain rules (participant
 * authorization, sender derivation, normalisation, insertion, idempotency) to
 * the service; this only maps success → a canonical redirect and failure → a
 * safe kind. Does NOT perform the redirect (the action does). The success target
 * is always the bare latest thread — any `?cursor=` is dropped and the new
 * message is never placed in the URL.
 */
export async function resolveSendMessage(
  userId: string,
  conversationId: string,
  body: unknown,
  clientSubmissionId: unknown,
): Promise<SendMessageOutcome> {
  const token =
    typeof clientSubmissionId === 'string' ? clientSubmissionId : undefined;
  try {
    // Throttle per verified sender before touching the service or DB.
    enforceActionRateLimit('messageSend', userId);
    await sendConversationMessage(userId, conversationId, body, token);
    return { kind: 'redirect', to: `/messages/${conversationId}` };
  } catch (error) {
    return { kind: 'error', error: mapSendError(error) };
  }
}

/** Error state carrying the failure kind, for `useActionState`. */
export function sendErrorState(error: SendErrorKind): SendMessageState {
  return { status: 'error', error };
}

/* --------------------------- listing-page CTA ----------------------------- */

export type MessageCtaState = 'guest' | 'owner' | 'buyer';

/**
 * Which "Message seller" control the listing page should render. Computed
 * server-side; the owner's profile id is used only for the comparison and is
 * NEVER returned or serialised. Request-memoized. One lightweight query.
 */
export const resolveMessageCtaState = cache(
  async (
    userId: string | null,
    listingId: string,
  ): Promise<MessageCtaState> => {
    if (!userId) return 'guest';
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { seller: { select: { profileId: true } } },
    });
    // The page only renders the CTA for a published listing it already loaded,
    // so a missing row here is a benign race -> treat as a non-owner buyer; the
    // action still resolves it safely.
    if (!listing) return 'buyer';
    return listing.seller.profileId === userId ? 'owner' : 'buyer';
  },
);
