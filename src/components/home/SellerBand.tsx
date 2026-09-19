import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';

/**
 * Seller call-to-action band — the prototype's `.sellband`, with the
 * Sustainable copy adjusted to the classifieds model (no shipping, no
 * platform-tracked impact claims).
 */
export async function SellerBand() {
  const t = await getTranslations('Home');
  return (
    <section
      aria-labelledby="sellband-heading"
      className="mx-auto mt-14 max-w-shell px-4 sm:px-8 lg:px-10"
    >
      <div className="flex flex-wrap items-center gap-8 rounded-card border border-line bg-gradient-to-r from-sand to-surface px-7 py-8 sm:px-12 sm:py-12">
        <h2
          id="sellband-heading"
          className="min-w-[260px] flex-1 font-display text-2xl font-bold leading-[1.02] text-ink sm:text-[38px]"
        >
          {t('sellBandHeading')}
        </h2>
        <p className="max-w-[34ch] text-sm leading-relaxed text-muted">
          {t('sellBandBody')}
        </p>
        <Button href="/sell" size="lg">
          {t('startSelling')}
        </Button>
      </div>
    </section>
  );
}
