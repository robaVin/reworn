import { Suspense } from 'react';
import { Hero } from '@/components/home/Hero';
import {
  EditSection,
  EditSectionSkeleton,
} from '@/components/home/EditSection';
import { InsideGalerija } from '@/components/home/InsideGalerija';
import { SustainabilityBand } from '@/components/home/SustainabilityBand';
import { SellerBand } from '@/components/home/SellerBand';

// EditSection reads real published listings, so this route is dynamic.
export const dynamic = 'force-dynamic';

/**
 * Galerija homepage — the permanent Sustainable production interface. The static
 * Hero is the instant shell (first byte); "the edit" (real published listings +
 * categories) streams into its own Suspense boundary, so the homepage never
 * blanks on the catalog query.
 */
export default function HomePage() {
  return (
    <main className="pb-4">
      <Hero />
      <Suspense fallback={<EditSectionSkeleton />}>
        <EditSection />
      </Suspense>
      <InsideGalerija />
      <SustainabilityBand />
      <SellerBand />
    </main>
  );
}
