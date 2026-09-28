import { Suspense } from 'react';
import { Hero } from '@/components/home/Hero';
import {
  EditSection,
  EditSectionSkeleton,
} from '@/components/home/EditSection';
import { InsideGalerija } from '@/components/home/InsideGalerija';
import { SustainabilityBand } from '@/components/home/SustainabilityBand';
import { SellerBand } from '@/components/home/SellerBand';
import { resolveHomepageOverrides } from '@/modules/homepage-media/service';

// EditSection reads real published listings, so this route is dynamic.
export const dynamic = 'force-dynamic';

/**
 * Galerija homepage — the permanent Sustainable production interface. The static
 * Hero is the instant shell (first byte); "the edit" (real published listings +
 * categories) streams into its own Suspense boundary, so the homepage never
 * blanks on the catalog query.
 *
 * Admin image overrides are resolved once here and passed to each image slot;
 * any slot without an override (the default state) falls back to its bundled
 * public/photos image inside the component, so the page can never break.
 */
export default async function HomePage() {
  const media = await resolveHomepageOverrides();
  return (
    <main className="pb-4">
      <Hero media={media.hero} />
      <Suspense fallback={<EditSectionSkeleton />}>
        <EditSection />
      </Suspense>
      <InsideGalerija
        media={{
          inside_1: media.inside_1,
          inside_2: media.inside_2,
          inside_3: media.inside_3,
        }}
      />
      <SustainabilityBand media={media.story} />
      <SellerBand />
    </main>
  );
}
