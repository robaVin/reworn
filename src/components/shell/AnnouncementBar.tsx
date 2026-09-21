import { getTranslations } from 'next-intl/server';

/**
 * Terracotta announcement bar. Copy is a truthful marketplace message —
 * Galerija is a classifieds marketplace and must not advertise shipping,
 * checkout or platform-managed purchases.
 */
export async function AnnouncementBar() {
  const t = await getTranslations('Announcement');
  return (
    <div className="bg-terracotta-strong px-3 py-2 text-center text-xs tracking-[0.06em] text-cream">
      {t('message')}
    </div>
  );
}
