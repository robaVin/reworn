/**
 * Category-shaped garment silhouette on a soft tinted gradient — the
 * prototype's photo placeholder art (`SHAPES` + `tint()`). Used whenever a
 * listing has no photo. Purely decorative.
 */
const SHAPES: Record<string, string> = {
  Outerwear:
    'M30 20 L45 10 L55 18 L70 10 L85 20 L78 40 L68 36 L68 92 L32 92 L32 36 L22 40 Z',
  Tops: 'M32 18 L46 12 L54 18 L68 12 L82 18 L76 36 L67 33 L67 88 L33 88 L33 33 L24 36 Z',
  Dresses: 'M38 12 L62 12 L58 30 L72 92 L28 92 L42 30 Z',
  Denim: 'M32 14 L68 14 L64 50 L60 92 L52 92 L50 55 L48 92 L40 92 L36 50 Z',
  Knitwear: 'M30 22 L44 14 L56 14 L70 22 L64 40 L66 88 L34 88 L36 40 Z',
  Shoes: 'M18 60 Q22 44 40 46 L58 58 L82 62 Q88 64 88 72 L88 78 L18 78 Z',
};

const BAG_SHAPE = (
  <>
    <rect x="34" y="16" width="32" height="18" rx="6" />
    <path d="M28 34 L72 34 L68 90 L32 90 Z" />
  </>
);

export function GarmentGlyph({
  category,
  hue,
  className,
}: {
  category: string;
  hue: number;
  className?: string;
}) {
  const shape =
    category === 'Bags' ? (
      BAG_SHAPE
    ) : (
      <path d={SHAPES[category] ?? SHAPES.Tops} />
    );

  return (
    <div
      aria-hidden="true"
      className={`grid h-full w-full place-items-center ${className ?? ''}`}
      style={{
        background: `linear-gradient(150deg, hsl(${hue} 30% 82% / .5), hsl(${(hue + 40) % 360} 34% 88% / .35))`,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-1/2 fill-terracotta opacity-80 transition-transform duration-500 group-hover:scale-105 motion-reduce:group-hover:scale-100"
      >
        {shape}
      </svg>
    </div>
  );
}
