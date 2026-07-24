import 'server-only';

import type { Listing, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { AuthorizationError } from '@/modules/auth/errors';
import type { AuthContext } from '@/modules/auth/authorization';
import { isAdmin } from '@/modules/auth/roles';
import {
  applyTransition,
  isEditable,
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

/** Resolves the seller profile owned by a user, or null if they have none. */
export async function resolveSellerForUser(userId: string) {
  return prisma.sellerProfile.findUnique({ where: { profileId: userId } });
}

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
  const seller = await resolveSellerForUser(userId);
  const subscriptionEnforced = env.SUBSCRIPTION_ENFORCEMENT;
  const hasActiveSubscription =
    seller && subscriptionEnforced
      ? await sellerHasActiveSubscription(seller.id)
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

/** Create a DRAFT listing owned by the current user's seller profile. */
export async function createDraftListing(
  userId: string,
  input: DraftListingInput,
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
  return prisma.listing.create({
    data: {
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
      status: 'draft',
    },
  });
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

/** Edit an owned listing. Only allowed while the listing is editable. */
export async function updateListing(
  userId: string,
  id: string,
  input: UpdateListingInput,
): Promise<Listing> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    ...listingWithOwner,
  });
  if (!listing) throw new AuthorizationError(404, 'not_found');
  assertOwner(userId, listing);

  if (!isEditable(listing.status)) {
    throw new ListingConflictError('listing_not_editable');
  }

  const data: Prisma.ListingUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.brand !== undefined) data.brand = input.brand ?? null;
  if (input.size !== undefined) data.size = input.size;
  if (input.color !== undefined) data.color = input.color ?? null;
  if (input.material !== undefined) data.material = input.material ?? null;
  if (input.condition !== undefined) data.condition = input.condition;
  if (input.gender !== undefined) data.gender = input.gender;
  if (input.priceMinor !== undefined) data.priceMinor = input.priceMinor;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.originalPriceMinor !== undefined) {
    data.originalPriceMinor = input.originalPriceMinor ?? null;
  }
  if (input.location !== undefined) data.location = input.location;
  if (input.categoryId !== undefined) {
    data.category = { connect: { id: input.categoryId } };
  }

  return prisma.listing.update({ where: { id }, data });
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
