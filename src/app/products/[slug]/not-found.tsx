import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Product not found',
  robots: { index: false, follow: true },
};

/**
 * Shown when a slug is unknown, malformed, OR the listing is not public (draft /
 * paused / archived). Deliberately does not reveal which — a non-public listing
 * is indistinguishable from a missing one.
 */
export default function ProductNotFound() {
  return (
    <main className="mx-auto max-w-shell px-4 py-16 sm:px-8 lg:px-10">
      <EmptyState
        title="This product isn’t available"
        action={<Button href="/browse">Back to browse</Button>}
      >
        It may have been removed, sold, or is no longer public. Explore what
        else is available.
      </EmptyState>
    </main>
  );
}
