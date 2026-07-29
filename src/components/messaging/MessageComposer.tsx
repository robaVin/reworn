'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { sendMessageAction } from '@/modules/messaging/actions';
import {
  INITIAL_SEND_STATE,
  sendErrorMessage,
} from '@/modules/messaging/compose-state';
import { MAX_MESSAGE_LENGTH } from '@/modules/messaging/schemas';
import { Button } from '@/components/ui/Button';

/**
 * Message composer — a progressively-enhanced form bound to the send Server
 * Action. Only conversationId, body, and an opaque idempotency token are
 * submitted; the sender is always derived server-side.
 *
 * Idempotency token: generated on the CLIENT after mount (so server and client
 * render the same empty value — no hydration mismatch, and a no-JS submit simply
 * falls back to a non-idempotent insert). A successful send redirects, which
 * remounts the composer and yields a fresh token for the next message.
 *
 * Accessibility: a persistent visible <label>, the character limit is announced,
 * validation errors are `role="alert"` and associated via `aria-describedby`
 * (never colour-only). The textarea is multiline — Enter inserts a newline
 * (default), there is no custom key handler, and submission is via the button.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Sending…' : 'Send'}
    </Button>
  );
}

export function MessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const [state, formAction] = useActionState(
    sendMessageAction,
    INITIAL_SEND_STATE,
  );
  const [submissionId, setSubmissionId] = useState('');
  const errorId = useId();
  const hintId = useId();
  const hasError = state.status === 'error';

  useEffect(() => {
    setSubmissionId(crypto.randomUUID());
  }, []);

  return (
    <form action={formAction} className="mt-8 border-t border-line pt-6">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="clientSubmissionId" value={submissionId} />

      <label
        htmlFor="message-body"
        className="block text-sm font-semibold text-ink"
      >
        Your message
      </label>
      <textarea
        id="message-body"
        name="body"
        rows={3}
        required
        maxLength={MAX_MESSAGE_LENGTH}
        aria-describedby={hasError ? `${errorId} ${hintId}` : hintId}
        aria-invalid={hasError ? true : undefined}
        className="mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:border-terracotta-strong focus-visible:ring-2 focus-visible:ring-terracotta-strong/40"
      />

      <p id={hintId} className="mt-1 text-xs text-muted">
        Plain text, up to {MAX_MESSAGE_LENGTH} characters. Payment and delivery
        are arranged directly with the other person.
      </p>
      {hasError && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
          {sendErrorMessage(state.error)}
        </p>
      )}

      <div className="mt-3">
        <SubmitButton />
      </div>
    </form>
  );
}
