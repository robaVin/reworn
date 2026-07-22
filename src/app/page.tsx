import { Hero } from '@/components/home/Hero';
import { EditSection } from '@/components/home/EditSection';
import { SellerBand } from '@/components/home/SellerBand';

/**
 * ReWorn homepage — the permanent Sustainable production interface.
 * The edit section shows labeled editorial design samples until the catalog
 * increment connects the real listing service (approved Decision 1).
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
