import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Shown for an unknown OR unauthorized conversation (indistinguishable — a third
 * party learns nothing about whether the conversation exists). Inherits the
 * generic noindex metadata from the route's generateMetadata.
 */
export default function ThreadNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <EmptyState
        title="Conversation not found"
        action={
          <Button href="/messages" variant="outline">
            Back to inbox
          </Button>
        }
      >
        This conversation doesn’t exist or isn’t available to you.
      </EmptyState>
    </main>
  );
}
