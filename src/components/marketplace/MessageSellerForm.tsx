'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { startConversationAction } from '@/modules/messaging/actions';
import {
  INITIAL_CONVERSATION_STATE,
  conversationErrorMessageKey,
} from '@/modules/messaging/conversation-cta';
import { Button } from '@/components/ui/Button';

/**
 * Buyer-facing "Message seller" control. A progressively-enhanced form bound to
 * the Server Action: the only submitted field is the listing id (a hidden input
 * mirroring the URL), so no participant identity is ever client-supplied.
 * `useFormStatus` disables the button while the action runs to prevent an
 * accidental double submission; the action is idempotent regardless.
 */

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations('Messages');
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="w-full sm:w-auto"
    >
      {pending ? t('starting') : t('messageSeller')}
    </Button>
  );
}

export function MessageSellerForm({ listingId }: { listingId: string }) {
  const t = useTranslations('Messages');
  const [state, formAction] = useActionState(
    startConversationAction,
    INITIAL_CONVERSATION_STATE,
  );

  return (
    <form action={formAction} className="mt-2">
      <input type="hidden" name="listingId" value={listingId} />
      <SubmitButton />
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t(`conversationError.${conversationErrorMessageKey(state.error)}`)}
        </p>
      )}
    </form>
  );
}
