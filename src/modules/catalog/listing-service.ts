import 'server-only';

import { cache } from 'react';
import type { Listing, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { AuthorizationError } from '@/modules/auth/errors';
import type { AuthContext } from '@/modules/auth/authorization';
import { isAdmin } from '@/modules/auth/roles';
import {
  applyTransition,
  type ListingStatus,
  type ListingTransition,
} from './listing-status';
import { env } from '@/lib/env';
import {
  assertCanCreateListing,
  assertCanPublishListing,
  canPublishListing,
} from './entitlement';
import { ListingConflictError, ListingIncompleteError } from './errors';
import { getStorageAdapter } from './storage';
import { SIGNED_URL_TTL_SECONDS } from './image-config';
import { timeSpan } from '@/lib/perf';
import {
  publishableListingSchema,
  type DraftListingInput,
  type UpdateListingInput,
} from './schemas';

/**
 * Listing service — the ONLY sanctioned path for listing reads and writes.
 *
 * WRITES use the privileged Prisma connection with EXPLICIT server-side
 * ownership + entitlement checks (RLS does not protect the service-role path).
 * READS mirror the RLS policy so the service and the database agree:
 *   • public: only published
 *   • owner: their own listings in any status
 *   • admin: everything
 */

export type Viewer = Pick<AuthContext, 'userId' | 'roles'> | null;

const listingWithOwner = {
  include: { seller: { select: { id: true, profileId: true, status: true } } },
} satisfies Prisma.ListingDefaultArgs;

export type ListingWithOwner = Prisma.ListingGetPayload<
  typeof listingWithOwner
>;

/**
 * Resolves the seller profile owned by a user, or null if they have none.
 * Request-memoized: the page guard and a subsequent service call in the same
 * request share one lookup instead of re-querying `seller_profiles`.
 */
export const resolveSellerForUser = cache(async (userId: string) => {
  return prisma.sellerProfile.findUnique({ where: { profileId: userId } });
});

/** Upper bound on a single seller-listings query (keeps it from being unbounded). */
const SELLER_LISTINGS_MAX = 200;

/** Active categories for selection UIs (public catalogue). */
export async function listActiveCategories(): Promise<
  Array<{ id: string; name: string }>
> {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}

/** True if the seller currently holds an active/grace subscription. */
async function sellerHasActiveSubscription(sellerId: string): Promise<boolean> {
  const sub = await prisma.subscription.findFirst({
    where: { sellerId, status: { in: ['active', 'grace_period'] } },
    select: { id: true },
  });
  return sub !== null;
}

/**
 * Aggregated seller access for routing/UI decisions (used by /sell). Reads the
 * enforcement mode from the server environment and the real subscription state
 * from the database — never from the request.
 */
export interface SellerAccess {
  seller: Awaited<ReturnType<typeof resolveSellerForUser>>;
  subscriptionEnforced: boolean;
  hasActiveSubscription: boolean;
  canPublish: boolean;
}

export async function getSellerAccess(userId: string): Promise<SellerAccess> {
  const seller = await timeSpan('db.seller', () =>
    resolveSellerForUser(userId),
  );
  const subscriptionEnforced = env.SUBSCRIPTION_ENFORCEMENT;
  const hasActiveSubscription =
    seller && subscriptionEnforced
      ? await timeSpan('db.subscription', () =>
          sellerHasActiveSubscription(seller.id),
        )
      : false;
  const canPublish = seller
    ? canPublishListing({
        sellerStatus: seller.status,
        subscriptionEnforced,
        hasActiveSubscription,
      })
    : false;
  return { seller, subscriptionEnforced, hasActiveSubscription, canPublish };
}

function assertOwner(userId: string, listing: ListingWithOwner): void {
  if (listing.seller.profileId !== userId) {
    // 404 (not 403) to avoid disclosing that a listing exists to non-owners.
    throw new AuthorizationError(404, 'not_found');
  }
}

/**
 * Create a DRAFT listing owned by the current user's seller profile.
 *
 * When `bootstrapKey` is supplied the create is IDEMPOTENT: the unique index on
 * `bootstrap_key` (migration 0010) makes concurrent "first actions" from one
 * form session converge on a single row. The race loser catches the unique
 * violation and returns the winning listing (only if it belongs to the same
 * seller). This does not rely on the client disabling a button.
 */
export async function createDraftListing(
  userId: string,
  input: DraftListingInput,
  opts: { bootstrapKey?: string } = {},
): Promise<Listing> {
  const seller = await resolveSellerForUser(userId);
  if (!seller) {
    // The user holds the seller role but has no seller profile yet (seller
    // onboarding is a later increment). Fail clearly; never fabricate one.
    throw new AuthorizationError(403, 'seller_profile_required');
  }
  assertCanCreateListing({ sellerStatus: seller.status });

  // A draft may be incomplete: only the title is guaranteed; the rest is
  // whatever the seller has entered so far (null when absent).
  const data = {
    sellerId: seller.id,
    categoryId: input.categoryId ?? null,
    title: input.title,
    description: input.description ?? null,
    brand: input.brand ?? null,
    size: input.size ?? null,
    color: input.color ?? null,
    material: input.material ?? null,
    condition: input.condition ?? null,
    gender: input.gender,
    priceMinor: input.priceMinor ?? null,
    currency: input.currency,
    originalPriceMinor: input.originalPriceMinor ?? null,
    location: input.location ?? null,
    status: 'draft' as const,
    bootstrapKey: opts.bootstrapKey ?? null,
  };

  if (!opts.bootstrapKey) {
    return timeSpan('db.bootstrap', () => prisma.listing.create({ data }));
  }

  try {
    return await timeSpan('db.bootstrap', () =>
      prisma.listing.create({ data }),
    );
  } catch (e) {
    // P2002 = unique violation on bootstrap_key: another concurrent request won.
    if ((e as { code?: string }).code === 'P2002') {
      const existing = await prisma.listing.findUnique({
        where: { bootstrapKey: opts.bootstrapKey },
      });
      if (existing && existing.sellerId === seller.id) return existing;
      throw new ListingConflictError('bootstrap_conflict');
    }
    throw e;
  }
}

/**
 * Load a listing the user OWNS (for the seller edit surface). Returns null when
 * it does not exist or belongs to someone else — the caller renders notFound(),
 * so a non-owner cannot even tell the listing exists (IDOR-safe).
 */
export async function getOwnedListing(
  userId: string,
  id: string,
): Promise<ListingWithOwner | null> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    ...listingWithOwner,
  });
  if (!listing || listing.seller.profileId !== userId) return null;
  return listing;
}

/** Read a single listing, applying the same visibility rules as RLS. */
export async function getListingForViewer(
  viewer: Viewer,
  id: string,
): Promise<ListingWithOwner | null> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    ...listingWithOwner,
  });
  if (!listing) return null;

  if (listing.status === 'published') return listing;
  if (viewer && listing.seller.profileId === viewer.userId) return listing;
  if (viewer && isAdmin(viewer.roles)) return listing;
  return null; // hidden — caller renders 404
}

/** A seller's own listings (any status), newest first. */
export async function listSellerListings(
  userId: string,
  opts: { status?: ListingStatus } = {},
): Promise<Listing[]> {
  const seller = await resolveSellerForUser(userId);
  if (!seller) return [];
  return prisma.listing.findMany({
    where: { sellerId: seller.id, status: opts.status },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SELLER_LISTINGS_MAX,
  });
}

/** A seller-dashboard card: the essentials plus a signed cover-image URL. */
export interface SellerListingCard {
  id: string;
  title: string;
  status: Listing['status'];
  priceMinor: number | null;
  currency: string;
  updatedAt: Date;
  coverUrl: string | null;
}

/**
 * The seller's own listings as dashboard cards, newest-updated first. Cover
 * URLs for ALL rows are signed in a SINGLE batched request (not one per row).
 */
export async function listSellerListingCards(
  userId: string,
): Promise<SellerListingCard[]> {
  const seller = await resolveSellerForUser(userId);
  if (!seller) return [];

  const rows = await timeSpan('db.cards', () =>
    prisma.listing.findMany({
      where: { sellerId: seller.id },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: SELLER_LISTINGS_MAX,
      select: {
        id: true,
        title: true,
        status: true,
        priceMinor: true,
        currency: true,
        updatedAt: true,
        images: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          take: 1,
          select: { storageKey: true },
        },
      },
    }),
  );

  const coverKeys = rows
    .map((r) => r.images[0]?.storageKey)
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
    const key = r.images[0]?.storageKey;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      priceMinor: r.priceMinor,
      currency: r.currency,
      updatedAt: r.updatedAt,
      coverUrl: key ? (signed.get(key) ?? null) : null,
    };
  });
}

export interface PublishedListingPage {
  items: Listing[];
  nextCursor: string | null;
}

/**
 * Public browse — published listings only, newest first, keyset-paginated.
 * Rich search/filters arrive in Increment 2D; this is the foundation query.
 */
export async function listPublishedListings(opts: {
  take?: number;
  cursor?: string | null;
  categoryId?: string;
}): Promise<PublishedListingPage> {
  const take = Math.min(Math.max(opts.take ?? 24, 1), 60);
  const rows = await prisma.listing.findMany({
    where: { status: 'published', categoryId: opts.categoryId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1, // fetch one extra to detect the next page
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, take);
  const nextCursor =
    rows.length > take ? (items[items.length - 1]?.id ?? null) : null;
  return { items, nextCursor };
}

/**
 * Edit an owned, editable listing in a SINGLE ownership-scoped write (P1).
 *
 * Ownership (`seller.profileId === userId`) AND the editable-status restriction
 * live in the UPDATE predicate, so exactly one round-trip both authorizes and
 * writes. `count === 0` means wrong owner, missing listing, OR a non-editable
 * status — all collapse to 404 so the caller cannot tell which condition held
 * (no information leak). Validation still happens upstream (Zod in the action);
 * this does not touch RLS — the privileged path enforces ownership explicitly,
 * exactly as the previous read-then-write did.
 */
export async function updateListing(
  userId: string,
  id: string,
  input: UpdateListingInput,
): Promise<{ id: string }> {
  // Unchecked variant so the scalar FK `categoryId` is settable in updateMany.
  const data: Prisma.ListingUncheckedUpdateManyInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) {
    data.description = input.description ?? null;
  }
  if (input.brand !== undefined) data.brand = input.brand ?? null;
  if (input.size !== undefined) data.size = input.size ?? null;
  if (input.color !== undefined) data.color = input.color ?? null;
  if (input.material !== undefined) data.material = input.material ?? null;
  if (input.condition !== undefined) data.condition = input.condition ?? null;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.priceMinor !== undefined)
    data.priceMinor = input.priceMinor ?? null;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.originalPriceMinor !== undefined) {
    data.originalPriceMinor = input.originalPriceMinor ?? null;
  }
  if (input.location !== undefined) data.location = input.location ?? null;
  if (input.categoryId !== undefined)
    data.categoryId = input.categoryId ?? null;

  const res = await timeSpan('db.autosave', () =>
    prisma.listing.updateMany({
      where: {
        id,
        status: { in: ['draft', 'paused'] },
        seller: { profileId: userId },
      },
      data,
    }),
  );
  // No row matched: wrong owner, missing, or non-editable — do not disclose which.
  if (res.count === 0) throw new AuthorizationError(404, 'not_found');
  return { id };
}

/** Apply a lifecycle transition to an owned listing. */
export async function transitionListing(
  userId: string,
  id: string,
  action: ListingTransition,
): Promise<Listing> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    ...listingWithOwner,
  });
  if (!listing) throw new AuthorizationError(404, 'not_found');
  assertOwner(userId, listing);

  const nextStatus = applyTransition(listing.status, action);

  // Publishing is the entitlement gate (subscription/quota join here at #7)
  // AND the completeness gate: a draft may be incomplete, but a published
  // listing must have every mandatory field.
  if (nextStatus === 'published') {
    const subscriptionEnforced = env.SUBSCRIPTION_ENFORCEMENT;
    const hasActiveSubscription = subscriptionEnforced
      ? await sellerHasActiveSubscription(listing.seller.id)
      : false;
    assertCanPublishListing({
      sellerStatus: listing.seller.status,
      subscriptionEnforced,
      hasActiveSubscription,
    });
    const parsed = publishableListingSchema.safeParse({
      title: listing.title,
      description: listing.description ?? undefined,
      categoryId: listing.categoryId ?? undefined,
      brand: listing.brand ?? undefined,
      size: listing.size ?? undefined,
      color: listing.color ?? undefined,
      material: listing.material ?? undefined,
      condition: listing.condition ?? undefined,
      gender: listing.gender,
      priceMinor: listing.priceMinor ?? undefined,
      currency: listing.currency,
      originalPriceMinor: listing.originalPriceMinor ?? undefined,
      location: listing.location ?? undefined,
    });
    if (!parsed.success) {
      throw new ListingIncompleteError(parsed.error.flatten().fieldErrors);
    }
  }

  return prisma.listing.update({
    where: { id },
    data: {
      status: nextStatus,
      // Stamp publishedAt the first time it goes live; keep it thereafter.
      ...(nextStatus === 'published' && listing.publishedAt === null
        ? { publishedAt: new Date() }
        : {}),
    },
  });
}
