import { Button } from '@/components/ui/Button';
import { MessageSellerForm } from './MessageSellerForm';
import type { MessageCtaState } from '@/modules/messaging/conversation-actions';

/**
 * The "Message seller" control on a published listing. Server component; renders
 * one of three states decided server-side:
 *   - guest  -> a sign-in link that returns to this listing (no conversation is
 *     created before authentication),
 *   - owner  -> a non-interactive "your listing" note,
 *   - buyer  -> the progressively-enhanced creation form.
 * No profile/seller ids are ever rendered.
 */
export function MessageSellerCta({
  listingId,
  state,
}: {
  listingId: string;
  state: MessageCtaState;
}) {
  if (state === 'owner') {
    return (
      <p
        className="mt-2 rounded-control border border-line bg-sand px-4 py-2.5 text-sm font-medium text-muted"
        data-testid="own-listing-note"
      >
        This is your listing
      </p>
    );
  }

  if (state === 'guest') {
    const next = encodeURIComponent(`/listing/${listingId}`);
    return (
      <Button
        href={`/login?next=${next}`}
        variant="primary"
        className="mt-2 w-full sm:w-auto"
      >
        Sign in to message seller
      </Button>
    );
  }

  return <MessageSellerForm listingId={listingId} />;
}
