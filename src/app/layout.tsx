import type { Metadata, Viewport } from 'next';
import { Fraunces, Work_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { LOCALE_HTML_LANG, normalizeLocale } from '@/i18n/config';
import { AnnouncementBar } from '@/components/shell/AnnouncementBar';
import { SiteHeader } from '@/components/shell/SiteHeader';
import { SiteFooter } from '@/components/shell/SiteFooter';
import './globals.css';

/**
 * Typography for the approved "warm & simple" direction:
 * Fraunces (display serif) + Work Sans (humanist body).
 * Self-hosted by next/font — no runtime request to Google, which keeps the
 * Content-Security-Policy free of third-party font/style sources.
 */
const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const body = Work_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-body',
});

export const metadata: Metadata = {
  // Resolves relative canonical/OG URLs to absolute against the app origin.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Galerija — Give great clothes a second life',
    template: '%s · Galerija',
  },
  description:
    'Buy and sell pre-loved fashion. Browse thousands of second-hand ' +
    'clothes, shoes, bags, accessories and jewellery.',
  applicationName: 'Galerija',
  // Site-wide Open Graph defaults; listing/shop pages override title/image.
  openGraph: {
    siteName: 'Galerija',
    type: 'website',
    locale: 'en',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Galerija',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

/**
 * Force dynamic rendering for every route.
 *
 * REQUIRED by the nonce-based Content-Security-Policy: the middleware mints
 * a fresh nonce per request and Next.js stamps it onto its scripts during
 * SERVER rendering. Statically prerendered HTML cannot carry a per-request
 * nonce, so the strict CSP would block hydration on any static route in
 * production. Dynamic rendering is also what the auth-aware header needs
 * (it reads the session cookie on every request).
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#C06B4E',
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Locale is resolved per request from the NEXT_LOCALE cookie (force-dynamic),
  // so SSR and hydration agree — no English-then-switch flash.
  const locale = await getLocale();
  const messages = await getMessages();
  const t = await getTranslations('Common');

  return (
    <html
      lang={LOCALE_HTML_LANG[normalizeLocale(locale)]}
      className={`${display.variable} ${body.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <a
            href="#main"
            className="absolute left-4 top-4 z-[100] -translate-y-[300%] rounded-control bg-terracotta-strong px-5 py-2.5 text-sm font-semibold text-cream transition-transform focus:translate-y-0"
          >
            {t('skipToContent')}
          </a>
          <AnnouncementBar />
          {/* Server-authoritative header: identity comes from getAuthContext(). */}
          <SiteHeader />
          <div id="main" className="flex-1">
            {children}
          </div>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
