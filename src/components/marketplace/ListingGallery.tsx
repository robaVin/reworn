'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GarmentGlyph } from './GarmentGlyph';

export interface GalleryImage {
  url: string;
  width: number;
  height: number;
}

/**
 * Listing image gallery — a main image with a thumbnail strip. Thumbnails are
 * real buttons (keyboard-operable, `aria-current` marks the active one) that
 * swap the main image. With no images it renders the accessible garment-glyph
 * fallback instead. The only client state is the selected index.
 */
export function ListingGallery({
  images,
  title,
  category,
  tintHue,
}: {
  images: GalleryImage[];
  title: string;
  category: string;
  tintHue: number;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="relative aspect-square overflow-hidden rounded-card border border-line bg-sand"
        role="img"
        aria-label={`${title} — no photo provided`}
      >
        <GarmentGlyph
          category={category}
          hue={tintHue}
          className="h-full w-full"
        />
      </div>
    );
  }

  const main = images[Math.min(active, images.length - 1)]!;

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-card border border-line bg-sand">
        <Image
          src={main.url}
          alt={`${title} — photo ${active + 1} of ${images.length}`}
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
          priority
        />
      </div>

      {images.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Photo thumbnails">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-current={i === active}
                aria-label={`Show photo ${i + 1} of ${images.length}`}
                className={`relative block h-16 w-16 overflow-hidden rounded-control border transition-colors ${
                  i === active
                    ? 'border-terracotta-strong ring-2 ring-terracotta-strong'
                    : 'border-line hover:border-terracotta'
                }`}
              >
                <Image
                  src={img.url}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
