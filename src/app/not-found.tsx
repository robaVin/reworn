import { Button } from '@/components/ui/Button';

/**
 * 404 — also shown when a guard hides a protected area (403 → notFound()),
 * so the copy deliberately does not distinguish the two cases.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-shell flex-col items-center px-4 py-24 text-center sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
        404
      </p>
      <h1 className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">
        This page isn&apos;t here.
      </h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-muted">
        The page may have moved, or it may not exist. Nothing was lost on your
        side.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/">Back to the homepage</Button>
        <Button href="/browse" variant="outline">
          Browse the edit
        </Button>
      </div>
    </main>
  );
}
