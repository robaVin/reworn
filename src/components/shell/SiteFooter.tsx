import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Wordmark } from './Wordmark';
import { COMPANY } from '@/config/company';

/**
 * Site footer. Every link points at a real route — no dead navigation.
 * The Legal column links the compliance documentation (terms, privacy, cookies,
 * refunds, payments, contact). Labels are localized (en/sq/mk); routes and the
 * ReWorn brand are not.
 */
export async function SiteFooter() {
  const t = await getTranslations('Footer');
  const columns: Array<{
    heading: string;
    links: Array<{ label: string; href: string }>;
  }> = [
    {
      heading: t('marketplace'),
      links: [
        { label: t('browse'), href: '/browse' },
        { label: t('sell'), href: '/sell' },
        { label: t('pricing'), href: '/pricing' },
        { label: t('saved'), href: '/saved' },
      ],
    },
    {
      heading: t('account'),
      links: [
        { label: t('login'), href: '/login' },
        { label: t('register'), href: '/register' },
        { label: t('messages'), href: '/messages' },
      ],
    },
    {
      heading: t('legal'),
      links: [
        { label: t('terms'), href: '/terms' },
        { label: t('privacy'), href: '/privacy' },
        { label: t('cookies'), href: '/cookies' },
        { label: t('refunds'), href: '/refunds' },
        { label: t('payments'), href: '/payments' },
        { label: t('contact'), href: '/contact' },
      ],
    },
  ];

  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto grid max-w-shell gap-10 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-5 lg:px-10">
        <div className="lg:col-span-2">
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            {t('description')}
          </p>
          <p className="mt-4 text-sm text-muted">
            {t('support')}{' '}
            <a
              href={`mailto:${COMPANY.supportEmail}`}
              className="text-ink hover:text-terracotta-strong"
            >
              {COMPANY.supportEmail}
            </a>
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.heading} aria-label={col.heading}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {col.heading}
            </h2>
            <ul className="mt-4 space-y-3">
              {col.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink hover:text-terracotta-strong"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-2 px-4 py-5 text-[13px] text-muted sm:px-8 lg:px-10">
          <span>© {new Date().getFullYear()} ReWorn</span>
          <span>{t('securePayments')}</span>
        </div>
      </div>
    </footer>
  );
}
