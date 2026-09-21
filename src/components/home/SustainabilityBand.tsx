import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';

/**
 * Sustainability story band — a wide boutique photograph paired with a truthful
 * message about second-hand keeping clothing in circulation. Reuses the exact
 * Sustainable tokens (sand→surface gradient, line borders, rounded-card, forest
 * decorative accent). Makes no fabricated impact metrics; the copy mirrors the
 * hero's truthful "in circulation, out of landfill" framing.
 */
export async function SustainabilityBand() {
  const t = await getTranslations('Home');
  return (
    <section
      aria-labelledby="sustainability-heading"
      className="mx-auto mt-16 max-w-shell px-4 sm:px-8 lg:px-10"
    >
      <div className="grid items-stretch overflow-hidden rounded-card border border-line bg-gradient-to-r from-sand to-surface lg:grid-cols-[1.15fr_0.85fr]">
        <div className="relative aspect-[16/10] lg:aspect-auto lg:min-h-[320px]">
          <Image
            src="/photos/story-rack.jpg"
            alt={t('sustainabilityPhotoAlt')}
            fill
            loading="lazy"
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover object-center"
          />
        </div>

        <div className="relative px-7 py-9 sm:px-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
            {t('sustainabilityEyebrow')}
          </p>
          <h2
            id="sustainability-heading"
            className="mt-3 font-display text-3xl font-bold leading-[1.02] tracking-tight text-ink sm:text-4xl"
          >
            {t('sustainabilityHeading')}
          </h2>
          <p className="mt-4 max-w-[42ch] text-base leading-relaxed text-muted">
            {t('sustainabilityBody')}
          </p>
          <div className="mt-6">
            <Button href="/browse" size="lg">
              {t('sustainabilityCta')}
            </Button>
          </div>

          {/* Decorative leaf motif — forest accent, low opacity (non-text). */}
          <svg
            aria-hidden="true"
            viewBox="0 0 64 64"
            fill="none"
            className="pointer-events-none absolute bottom-5 right-5 hidden h-16 w-16 text-forest/25 sm:block"
          >
            <path
              d="M8 56C8 32 28 12 56 8c0 28-20 48-48 48Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 50C26 40 40 26 50 14"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    </section>
  );
}
