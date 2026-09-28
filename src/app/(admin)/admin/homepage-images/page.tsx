import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdminPage } from '@/modules/auth/page-guards';
import { listHomepageSlotStates } from '@/modules/homepage-media/service';
import { HOMEPAGE_SLOTS, SLOT_META } from '@/modules/homepage-media/slots';
import { HomepageImageSlotEditor } from '@/components/admin/HomepageImageSlotEditor';

export const metadata: Metadata = { title: 'Homepage Images' };
export const dynamic = 'force-dynamic';

/**
 * Homepage Images admin — the single, narrow section the client requested.
 * Admin-only (the (admin) layout guard plus this page guard). Each of the five
 * FIXED slots shows its current picture (admin override if any, else the bundled
 * public/photos default) and lets an admin replace it + set alt text. No generic
 * CMS, no text/layout editing.
 */
export default async function HomepageImagesAdminPage() {
  await requireAdminPage('/admin');
  const states = await listHomepageSlotStates();

  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
            Admin &amp; support
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold text-ink sm:text-[34px]">
            Homepage Images
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            Replace any of the five homepage photographs. A slot keeps its
            bundled default until you upload a replacement, and reverts safely
            if an upload fails. JPEG, PNG or WebP, up to 8&nbsp;MB.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-semibold text-terracotta-strong hover:text-terracotta-hover"
        >
          View homepage →
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {HOMEPAGE_SLOTS.map((slot) => {
          const meta = SLOT_META[slot];
          const state = states[slot];
          return (
            <HomepageImageSlotEditor
              key={slot}
              slot={slot}
              label={meta.label}
              previewUrl={state?.previewUrl ?? meta.fallbackSrc}
              hasOverride={Boolean(state)}
              initialAlt={state?.alt ?? ''}
              updatedAt={
                state?.updatedAt ? state.updatedAt.toISOString() : null
              }
            />
          );
        })}
      </div>
    </main>
  );
}
