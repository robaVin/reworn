import 'server-only';

import { prisma } from '@/lib/db';
import { AuthorizationError } from '@/modules/auth/errors';
import { getStorageAdapter } from '@/modules/catalog/storage';
import { SIGNED_URL_TTL_SECONDS } from '@/modules/catalog/image-config';
import { timeSpan } from '@/lib/perf';
import type { ListingCardData } from '@/modules/catalog/types';
import {
  CONDITION_LABELS,
  hueFromId,
} from '@/components/marketplace/listing-card-data';

/**
 * Saved items (wishlist) service — the ONLY sanctioned path for save/unsave
 * reads and writes. WRITES use the privileged Prisma connection with the user
 * identity taken from the VERIFIED server-side session (never the client). READs
 * are owner-scoped by that same `userId`, and `/saved` reuses the PUBLIC
 * visibility contract (published or sold) so a saved draft/paused/archived
 * listing keeps its row but is never exposed.
 */

/** Statuses a saved listing may be SHOWN under — the public visibility contract. */
const SAVED_VISIBLE_STATUSES = ['published', 'sold'] as const;

/** Upper bound on the /saved page (keeps the query bounded). */
const SAVED_ITEMS_MAX = 100;

/**
 * Save a listing for the authenticated user. Idempotent and race-safe: the
 * composite unique makes a repeat save a no-op (the unique violation is caught
 * and treated as already-saved). A listing may be saved only while it is
 * publicly viewable (published or sold); any other status is reported as
 * not-found so hidden listings can neither be saved nor probed.
 */
export async function saveListing(
  userId: string,
  listingId: string,
): Promise<{ saved: true }> {
  const visible = await prisma.listing.findFirst({
    where: { id: listingId, status: { in: [...SAVED_VISIBLE_STATUSES] } },
    select: { id: true },
  });
  // 404 (not 403) so a non-public/non-existent listing is indistinguishable.
  if (!visible) throw new AuthorizationError(404, 'not_found');

  try {
    await timeSpan('db.save', () =>
      prisma.savedItem.create({ data: { userId, listingId } }),
    );
  } catch (e) {
    // P2002 = the (user, listing) pair already exists → already saved, no-op.
    if ((e as { code?: string }).code !== 'P2002') throw e;
  }
  return { saved: true };
}

/**
 * Remove a saved listing for the authenticated user. Idempotent: deleting a
 * non-existent save affects zero rows and is a safe no-op. Scoped to the
 * caller's own rows, so it can never remove another user's save.
 */
export async function unsaveListing(
  userId: string,
  listingId: string,
): Promise<{ saved: false }> {
  await timeSpan('db.unsave', () =>
    prisma.savedItem.deleteMany({ where: { userId, listingId } }),
  );
  return { saved: false };
}

/**
 * The subset of `listingIds` the user has saved, as a Set — ONE bounded query
 * for a whole rendered collection (never one lookup per card). Returns an empty
 * Set without touching the database when the input is empty (e.g. anonymous
 * callers should not call this at all).
 */
export async function getSavedListingIds(
  userId: string,
  listingIds: string[],
): Promise<Set<string>> {
  if (listingIds.length === 0) return new Set();
  const rows = await timeSpan('db.savedIds', () =>
    prisma.savedItem.findMany({
      where: { userId, listingId: { in: listingIds } },
      select: { listingId: true },
    }),
  );
  return new Set(rows.map((r) => r.listingId));
}

/** A saved-listing card for `/saved` — the public card fields plus its status. */
export type SavedListingCard = ListingCardData & {
  status: 'published' | 'sold';
};

/**
 * The authenticated user's saved listings as cards, most-recently-saved first,
 * bounded, with covers signed in a SINGLE batched request. Reuses the PUBLIC
 * visibility contract: only published or sold listings are returned, so hidden
 * statuses (draft/paused/archived) never leak even though their saved rows
 * persist. A listing that returns to published reappears automatically.
 */
export async function listSavedForUser(
  userId: string,
): Promise<SavedListingCard[]> {
  const rows = await timeSpan('db.saved', () =>
    prisma.savedItem.findMany({
      where: {
        userId,
        listing: { status: { in: [...SAVED_VISIBLE_STATUSES] } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: SAVED_ITEMS_MAX,
      select: {
        listing: {
          select: {
            id: true,
            slug: true,
            title: true,
            brand: true,
            size: true,
            condition: true,
            priceMinor: true,
            currency: true,
            status: true,
            category: { select: { name: true } },
            images: {
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
              take: 1,
              select: { storageKey: true },
            },
          },
        },
      },
    }),
  );

  const coverKeys = rows
    .map((r) => r.listing.images[0]?.storageKey)
    .filter((k): k is string => Boolean(k));
  const signed =
    coverKeys.length > 0
      ? await timeSpan(
          'storage.sign',
          () =>
            getStorageAdapter().createSignedUrls(
              coverKeys,
              SIGNED_URL_TTL_SECONDS,
            ),
          { count: coverKeys.length },
        )
      : new Map<string, string>();

  return rows.map((r) => {
    const l = r.listing;
    const key = l.images[0]?.storageKey;
    return {
      id: l.id,
      slug: l.slug,
      title: l.title,
      brand: l.brand ?? '',
      size: l.size ?? '',
      category: l.category?.name ?? '',
      condition: l.condition
        ? (CONDITION_LABELS[l.condition] ?? l.condition)
        : '',
      priceMinor: l.priceMinor ?? 0,
      currency: l.currency,
      imageUrl: key ? (signed.get(key) ?? null) : null,
      tintHue: hueFromId(l.id),
      // Only published/sold reach here; narrow for the card's status badge.
      status: l.status === 'sold' ? 'sold' : 'published',
    };
  });
}
