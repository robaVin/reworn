import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';

/**
 * Status pill for a listing, in the Sustainable palette. Communicates status by
 * TEXT (localized `Sell.status.*`) as well as tint — never colour alone (a11y).
 * `sold` uses a neutral ink tint (a seller declaration, not a loud state).
 */
const STATUS_CLASSES: Record<string, string> = {
  draft: 'bg-sand text-ink',
  published: 'bg-forest/10 text-forest',
  paused: 'bg-terracotta/10 text-terracotta-strong',
  sold: 'bg-ink/10 text-ink',
  archived: 'bg-ink/5 text-muted',
};

export async function ListingStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const t = await getTranslations('Sell');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        STATUS_CLASSES[status] ?? 'bg-sand text-ink',
        className,
      )}
    >
      {t.has(`status.${status}`) ? t(`status.${status}`) : status}
    </span>
  );
}
