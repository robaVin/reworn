/**
 * Stage 1 application shell.
 *
 * Deliberately minimal: Stage 1 delivers the secure foundation, not the
 * marketplace. The catalog, listings and seller flows arrive in Stage 2.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta">
        Stage 1 · Foundation
      </p>

      <h1 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
        Give great clothes a second life.
      </h1>

      <p className="mt-4 max-w-prose text-base text-muted">
        ReWorn is a marketplace for pre-loved fashion. Buyers browse and message
        sellers directly; sellers subscribe to publish listings.
      </p>

      <div className="mt-10 rounded-card border border-line bg-surface p-6 shadow-soft">
        <h2 className="font-display text-lg">Foundation status</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>Secure application shell and PWA — ready</li>
          <li>Authentication, roles and permissions — wired</li>
          <li>Subscription domain and payment abstraction — implemented</li>
          <li>Marketplace features — Stage 2</li>
        </ul>
      </div>
    </main>
  );
}
