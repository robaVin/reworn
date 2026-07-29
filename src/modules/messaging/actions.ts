'use server';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/modules/auth/session';
import { logger } from '@/lib/logger';
import { timeSpan } from '@/lib/perf';
import { safeRedirectPath } from '@/lib/safe-redirect';
import {
  resolveStartConversation,
  resolveSendMessage,
  sendErrorState,
} from './conversation-actions';
import type { StartConversationState } from './conversation-cta';
import type { SendMessageState } from './compose-state';

/**
 * Conversation-creation Server Action — the authenticated write boundary for
 * starting or reopening a buyer↔seller conversation from a published listing.
 *
 * WHY A SERVER ACTION (not a Route Handler): Next.js Server Actions are
 * POST-only, invoked through an encrypted, per-build action id with framework
 * same-origin/CSRF protection, so there is NO GET mutation path and no
 * client-forgeable endpoint. They give progressive enhancement (`<form action>`
 * works without JS), first-class `redirect()`, and the identity comes from the
 * server auth context — the client can only submit a `listingId`.
 *
 * Identity: the buyer is ALWAYS the verified user; participant ids are never
 * accepted from the client. Success redirects to /messages/[conversationId]
 * (the conversation UI ships in 3B-C; the route 404s until then).
 */
export async function startConversationAction(
  _prev: StartConversationState,
  formData: FormData,
): Promise<StartConversationState> {
  const ctx = await getAuthContext();
  const outcome = await timeSpan('action.startConversation', () =>
    resolveStartConversation(ctx?.userId ?? null, formData.get('listingId')),
  );

  // Observability: no ids, bodies, emails, or tokens -- only booleans/kind.
  logger.info('conversation.create', {
    authenticated: ctx !== null,
    outcome: outcome.kind,
    created: outcome.kind === 'redirect' ? (outcome.created ?? null) : null,
  });

  // redirect() throws NEXT_REDIRECT; called OUTSIDE any try/catch so it always
  // propagates (a redirect is not an error).
  if (outcome.kind === 'redirect') redirect(outcome.to);
  return { status: 'error', error: outcome.error };
}

/**
 * Message-send Server Action — a thin boundary over `sendConversationMessage`.
 * The client submits only a conversationId, the body, and an opaque idempotency
 * token; the SENDER is derived from the auth context (never the client). On
 * success it redirects (PRG) to the bare latest thread `/messages/[id]` so the
 * new message is visible, the cursor is cleared, and the body is not in the URL.
 */
export async function sendMessageAction(
  _prev: SendMessageState,
  formData: FormData,
): Promise<SendMessageState> {
  const conversationId = formData.get('conversationId');
  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    return { status: 'error', error: 'validationError' };
  }

  const ctx = await getAuthContext();
  if (!ctx) {
    // Session expired: create nothing, bounce to sign-in with a safe return.
    const next = safeRedirectPath(`/messages/${conversationId}`, '/messages');
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const outcome = await timeSpan('action.sendMessage', () =>
    resolveSendMessage(
      ctx.userId,
      conversationId,
      formData.get('body'),
      formData.get('clientSubmissionId'),
    ),
  );

  // Safe observability: outcome kind only — never body, preview, or ids.
  logger.info('conversation.send', {
    outcome: outcome.kind === 'redirect' ? 'sent' : outcome.error,
  });

  if (outcome.kind === 'redirect') redirect(outcome.to);
  return sendErrorState(outcome.error);
}
