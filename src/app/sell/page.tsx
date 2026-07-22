import type { Metadata } from 'next';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Sell on ReWorn' };

/**
 * Public "start selling" entry point.
 *
 * TRUTHFUL STATE: seller onboarding and subscriptions open with
 * Increment #6. This page explains the real model (subscription-gated
 * publishing, direct buyer contact, no platform checkout) without
 * pretending onboarding is live.
 */
const steps = [
  {
    title: 'Create your account',
    body: 'Register as a buyer first — every seller starts with a free buyer account.',
  },
  {
    title: 'Pick a seller plan',
    body: 'Publishing is subscription-based with a weekly listing quota. Plans and pricing are being finalised.',
  },
  {
    title: 'List your pieces',
    body: 'Photograph, describe and price your items. Buyers message you directly.',
  },
  {
    title: 'Arrange the handover',
    body: 'You and the buyer agree on payment and delivery between yourselves — ReWorn never takes a cut of the sale.',
  },
];

export default function SellPage() {
  return (
    <main className="mx-auto max-w-shell px-4 py-10 sm:px-8 lg:px-10">
      <div className="max-w-[640px]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-terracotta-strong">
          Sell on ReWorn
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-ink sm:text-5xl">
          Your closet clean-out can do good.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          ReWorn is a classifieds marketplace: you keep 100% of what you sell. A
          seller subscription unlocks publishing, buyers contact you directly,
          and payment and shipping stay between you and the buyer.
        </p>
      </div>

      <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="rounded-card border border-line bg-surface p-6"
          >
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-full bg-sand font-display text-base font-bold text-terracotta-strong"
            >
              {i + 1}
            </span>
            <h2 className="mt-4 font-display text-lg font-semibold text-ink">
              {step.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-10 max-w-[640px] space-y-6">
        <Alert tone="info" title="Seller onboarding opens soon">
          Subscriptions and listing tools are part of the next development
          increment. Create your account now and you&apos;ll be ready the day
          selling opens.
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button href="/register" size="lg">
            Create your account
          </Button>
          <Button href="/login" variant="outline" size="lg">
            Log in
          </Button>
        </div>
      </div>
    </main>
  );
}
