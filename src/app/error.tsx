'use client';

import { Button } from '@/components/ui/Button';

/**
 * Route error boundary. Shows a safe, generic message — never the raw
 * error, stack trace or any internal identifiers. `reset()` re-renders the
 * failed segment.
 */
export default function RouteError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-shell flex-col items-center px-4 py-24 text-center sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        Something went wrong
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">
        We couldn&apos;t load this page.
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
        The problem is on our side, not yours. You can try again — if it keeps
        happening, come back a little later.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button href="/" variant="outline">
          Back to the homepage
        </Button>
      </div>
    </main>
  );
}
