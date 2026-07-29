'use server';

import { redirect } from 'next/navigation';
import { getAuthContext } from '@/modules/auth/session';
import { logger } from '@/lib/logger';
import { timeSpan } from '@/lib/perf';
import { resolveStartConversation } from './conversation-actions';
import type { StartConversationState } from './conversation-cta';

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
