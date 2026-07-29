import { Hero } from '@/components/home/Hero';
import { EditSection } from '@/components/home/EditSection';
import { SellerBand } from '@/components/home/SellerBand';

// EditSection reads real published listings, so this route is dynamic.
export const dynamic = 'force-dynamic';

/**
 * ReWorn homepage — the permanent Sustainable production interface. "The edit"
 * shows REAL published listings (newest first) and real categories.
 */
export default function HomePage() {
  return (
    <main className="pb-4">
      <Hero />
      <EditSection />
      <SellerBand />
    </main>
  );
}
