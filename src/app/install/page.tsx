import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { InstallPanel } from '@/components/pwa/InstallPanel';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Get the app',
  description:
    'Install галерија on your phone or computer — it adds to your home screen straight from the browser, with nothing to download from an app store.',
  alternates: { canonical: '/install' },
  robots: { index: true, follow: true },
};

/**
 * /install — the real "Get the app" flow. galerija is a PWA, so this installs
 * straight from the browser (no app-store download). The server renders the
 * static explanation + benefits (localized); the client InstallPanel adds the
 * one honest action for the current browser.
 */
export default async function InstallPage() {
  const t = await getTranslations('Install');

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8 lg:px-10">
      <div className="flex items-center gap-4">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={64}
          height={64}
          className="rounded-[18px] shadow-soft"
          priority
        />
        <h1 className="font-display text-3xl font-bold text-ink sm:text-[34px]">
          {t('title')}
        </h1>
      </div>

      <p className="mt-5 max-w-prose text-sm leading-relaxed text-muted">
        {t('intro')}
      </p>

      <div className="mt-8">
        <Card>
          <InstallPanel />
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          {t('whatTitle')}
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-ink">
          <li>{t('what1')}</li>
          <li>{t('what2')}</li>
          <li>{t('what3')}</li>
        </ul>
      </Card>
    </main>
  );
}
