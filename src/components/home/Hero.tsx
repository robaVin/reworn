import { Button } from '@/components/ui/Button';

/**
 * Editorial hero — the Sustainable prototype's `.hero` with blurred
 * terracotta and sage shapes.
 *
 * TRUTHFUL COPY: the prototype's fabricated platform statistics ("48k+
 * items listed", "2.1M garments rehomed") are NOT shown as real metrics.
 * The statistics band keeps the prototype's layout but carries truthful
 * product facts; real marketplace metrics replace them when they exist.
 */
const PRODUCT_FACTS = [
  { value: '100%', label: 'Pre-loved pieces' },
  { value: '0%', label: 'Commission on sales' },
  { value: 'Direct', label: 'Buyer–seller contact' },
] as const;

export function Hero() {
  return (
    <section className="mx-auto mt-4 max-w-shell px-4 sm:mt-6 sm:px-8 lg:px-10">
      <div className="relative overflow-hidden rounded-card border border-line bg-gradient-to-br from-sand to-surface px-6 py-10 sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        {/* Decorative blurred shapes */}
        <div
          aria-hidden="true"
          className="blob -right-10 -top-24 h-[360px] w-[360px] bg-terracotta"
        />
        <div
          aria-hidden="true"
          className="blob -bottom-36 right-40 h-[300px] w-[300px] bg-forest"
        />

        <div className="relative z-10 max-w-[560px]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
            Pre-loved · Curated · Circular
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[0.98] tracking-tight text-ink sm:text-6xl lg:text-[68px]">
            Slow fashion, second life.
          </h1>
          <p className="mt-4 max-w-[44ch] text-base leading-relaxed text-muted">
            Every piece you buy or sell keeps good clothing in circulation — and
            out of landfill. Buyers and sellers connect directly, no middleman
            checkout.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button href="/#edit" size="lg">
              Shop the edit
            </Button>
            <Button href="/sell" variant="outline" size="lg">
              Start selling
            </Button>
          </div>

          <dl className="mt-9 flex flex-wrap gap-7">
            {PRODUCT_FACTS.map((fact) => (
              <div key={fact.label}>
                <dt className="sr-only">{fact.label}</dt>
                <dd className="font-display text-[26px] font-bold text-ink">
                  {fact.value}
                </dd>
                <dd className="text-xs tracking-[0.05em] text-muted">
                  {fact.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
