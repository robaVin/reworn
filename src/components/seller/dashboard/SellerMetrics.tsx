import { getTranslations } from 'next-intl/server';
import type { SellerListingCounts } from '@/modules/catalog/listing-service';

/**
 * The four approved Seller Studio metrics, from REAL authoritative status counts
 * (published / sold / draft / paused). `archived` is intentionally excluded.
 * No earnings, views, orders, or growth figures — Galerija has no authoritative
 * data for those and none is fabricated here.
 */
export async function SellerMetrics({
  counts,
}: {
  counts: SellerListingCounts;
}) {
  const t = await getTranslations('Sell');
  const cards = [
    { key: 'active', label: t('dashboard.metricActive'), value: counts.active },
    { key: 'sold', label: t('dashboard.metricSold'), value: counts.sold },
    { key: 'draft', label: t('dashboard.metricDrafts'), value: counts.draft },
    { key: 'paused', label: t('dashboard.metricPaused'), value: counts.paused },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.key}
          className="rounded-card border border-line bg-surface p-4 shadow-soft sm:p-5"
        >
          <dt className="text-xs uppercase tracking-[0.14em] text-muted">
            {c.label}
          </dt>
          <dd className="mt-1 font-display text-3xl font-bold text-ink">
            {c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
