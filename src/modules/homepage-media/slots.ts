import type { HomepageSlot } from '@prisma/client';

/**
 * The five FIXED homepage image slots (matches the Prisma `HomepageSlot` enum and
 * the images discovered in the homepage components). This is a closed set — the
 * admin can only replace these pictures, never add slots or content blocks.
 *
 * `fallbackSrc` is the bundled `public/photos/*` default that renders whenever a
 * slot has no admin override, so the homepage can never become a broken-image
 * experience. `label`/`group` drive the admin UI only.
 */
export const HOMEPAGE_SLOTS = [
  'hero',
  'inside_1',
  'inside_2',
  'inside_3',
  'story',
] as const;

export type HomepageSlotName = (typeof HOMEPAGE_SLOTS)[number];

export function isHomepageSlot(value: unknown): value is HomepageSlot {
  return (
    typeof value === 'string' &&
    (HOMEPAGE_SLOTS as readonly string[]).includes(value)
  );
}

export interface SlotMeta {
  label: string;
  group: 'Hero' | 'Inside Galerija' | 'Story / editorial';
  /** Bundled default image (public/photos/*) used when there is no override. */
  fallbackSrc: string;
}

export const SLOT_META: Record<HomepageSlotName, SlotMeta> = {
  hero: {
    label: 'Hero',
    group: 'Hero',
    fallbackSrc: '/photos/hero-rack.jpg',
  },
  inside_1: {
    label: 'Inside Galerija — 1',
    group: 'Inside Galerija',
    fallbackSrc: '/photos/inside-corner.jpg',
  },
  inside_2: {
    label: 'Inside Galerija — 2',
    group: 'Inside Galerija',
    fallbackSrc: '/photos/inside-bags.jpg',
  },
  inside_3: {
    label: 'Inside Galerija — 3',
    group: 'Inside Galerija',
    fallbackSrc: '/photos/inside-mirror.jpg',
  },
  story: {
    label: 'Story / editorial',
    group: 'Story / editorial',
    fallbackSrc: '/photos/story-rack.jpg',
  },
};
