import type { Metadata } from 'next';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Seller not found',
  robots: { index: false, follow: true },
};

/** Unknown, malformed, or reserved handles all render the same state. */
export default function ShopNotFound() {
  return (
    <main className="mx-auto max-w-shell px-4 py-16 sm:px-8 lg:px-10">
      <EmptyState
        title="This seller isn’t available"
        action={<Button href="/browse">Browse the marketplace</Button>}
      >
        We couldn’t find a seller at this address. It may have moved or never
        existed.
      </EmptyState>
    </main>
  );
}
