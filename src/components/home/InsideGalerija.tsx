import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';

/**
 * "Inside Galerija" — an editorial band pairing a short brand statement with
 * three real boutique photographs (each captioned). Photography supplies the
 * energy; the surrounding UI keeps the calm Sustainable tokens
 * (cream/sand, line borders, rounded-card, shadow-soft). No new palette is
 * derived from the images.
 */
export async function InsideGalerija() {
  const t = await getTranslations('Home');

  // Alt text resolves from literal keys (type-safe with next-intl). Alt stays
  // tied to each photograph; captions read left-to-right in the mockup order.
  const photos = [
    {
      src: '/photos/inside-corner.jpg',
      alt: t('insidePhoto3Alt'),
      caption: t('insideCaptionStyles'),
    },
    {
      src: '/photos/inside-bags.jpg',
      alt: t('insidePhoto2Alt'),
      caption: t('insideCaptionDetails'),
    },
    {
      src: '/photos/inside-mirror.jpg',
      alt: t('insidePhoto1Alt'),
      caption: t('insideCaptionCloset'),
    },
  ];

  return (
    <section
      aria-labelledby="inside-heading"
      className="mx-auto mt-16 max-w-shell px-4 sm:mt-20 sm:px-8 lg:px-10"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-center lg:gap-12">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
            {t('insideEyebrow')}
          </p>
          <h2
            id="inside-heading"
            className="mt-3 font-display text-3xl font-bold leading-[1.02] tracking-tight text-ink sm:text-4xl lg:text-5xl"
          >
            {t('insideHeading')}
          </h2>
          <p className="mt-4 max-w-[40ch] text-base leading-relaxed text-muted">
            {t('insideBody')}
          </p>
          <div className="mt-6">
            <Button href="/browse" variant="outline" size="lg">
              {t('insideCta')}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 sm:gap-5">
          {photos.map((photo) => (
            <figure key={photo.src}>
              <div className="relative aspect-listing overflow-hidden rounded-card border border-line shadow-soft">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  loading="lazy"
                  sizes="(min-width: 640px) 22vw, 100vw"
                  className="object-cover object-center"
                />
              </div>
              <figcaption className="mt-2 text-xs tracking-[0.05em] text-muted">
                {photo.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
