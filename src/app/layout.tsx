import type { Metadata, Viewport } from 'next';
import { Fraunces, Work_Sans } from 'next/font/google';
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
  title: {
    default: 'ReWorn — Give great clothes a second life',
    template: '%s · ReWorn',
  },
  description:
    'Buy and sell pre-loved fashion. Browse thousands of second-hand ' +
    'clothes, shoes, bags, accessories and jewellery.',
  applicationName: 'ReWorn',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'ReWorn',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#C06B4E',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
