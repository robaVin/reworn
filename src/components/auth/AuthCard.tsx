import Link from 'next/link';
import { Wordmark } from '@/components/shell/Wordmark';

/**
 * Centered Sustainable auth surface shared by login/register/recovery pages.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-4 py-12 sm:px-6 sm:py-16">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="rounded-card border border-line bg-surface p-6 shadow-soft sm:p-8">
        <h1 className="font-display text-3xl font-bold text-ink">{title}</h1>
        {subtitle && (
          <div className="mt-2 text-sm leading-relaxed text-muted">
            {subtitle}
          </div>
        )}
        <div className="mt-8">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-muted">{footer}</div>}
      <p className="mt-8 text-center text-xs text-muted">
        <Link href="/" className="font-semibold text-terracotta-strong">
          Back to the homepage
        </Link>
      </p>
    </main>
  );
}
