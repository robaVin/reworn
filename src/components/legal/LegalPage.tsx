import type { ReactNode } from 'react';

/**
 * Shared shell for the legal / compliance documentation pages, so all of them
 * share one consistent, accessible layout: an "Legal" eyebrow, a single <h1>,
 * a "Last updated" date, an optional intro, and a stack of <LegalSection>s.
 * Pure content — no data fetching.
 */
export function LegalPage({
  title,
  lastUpdated,
  intro,
  children,
}: {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-8 lg:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Legal
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted">
        Last updated: <time dateTime={lastUpdated}>{lastUpdated}</time>
      </p>
      {intro && (
        <p className="mt-6 text-sm leading-relaxed text-muted">{intro}</p>
      )}
      <div className="mt-8 space-y-8">{children}</div>
    </main>
  );
}

/** A titled section within a legal page. */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-ink">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}

/** An unordered list styled for legal prose. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A restrained callout for a "not legal advice" / important note. */
export function LegalNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-line bg-sand px-4 py-3 text-sm leading-relaxed text-muted">
      {children}
    </p>
  );
}
