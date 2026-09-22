import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';

/**
 * "Sell an item" card. A polished entry point that navigates to the EXISTING
 * production Sell flow (`/sell`) — it never duplicates the listing-creation form,
 * so the two can't diverge.
 */
export async function CreateListingCard() {
  const t = await getTranslations('Sell');
  return (
    <section
      aria-labelledby="dash-sell-heading"
      className="rounded-card border border-line bg-gradient-to-br from-sand to-surface p-5 shadow-soft"
    >
      <h2
        id="dash-sell-heading"
        className="font-display text-lg font-bold text-ink"
      >
        {t('dashboard.sellHeading')}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        {t('dashboard.sellBody')}
      </p>
      <div className="mt-4">
        <Button href="/sell">{t('dashboard.sellCta')}</Button>
      </div>
    </section>
  );
}
