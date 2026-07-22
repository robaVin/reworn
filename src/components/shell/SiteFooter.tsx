import Link from 'next/link';
import { Wordmark } from './Wordmark';

/**
 * Site footer. Every link points at a real route — no dead navigation.
 * Legal pages (terms, privacy) arrive with the registration increment and
 * are added here at that point rather than linked prematurely.
 */
const columns: Array<{
  heading: string;
  links: Array<{ label: string; href: string }>;
}> = [
  {
    heading: 'Marketplace',
    links: [
      { label: 'Browse the edit', href: '/browse' },
      { label: 'Sell an item', href: '/sell' },
      { label: 'Saved items', href: '/saved' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Log in', href: '/login' },
      { label: 'Create account', href: '/register' },
      { label: 'Messages', href: '/messages' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto grid max-w-shell gap-10 px-4 py-12 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-10">
        <div className="lg:col-span-2">
          <Wordmark />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            A classifieds marketplace for pre-loved fashion. Buyers and sellers
            connect directly — every rehomed piece keeps good clothing in
            circulation.
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
          <span>Slow fashion, second life.</span>
        </div>
      </div>
    </footer>
  );
}
