import 'server-only';

import { cache } from 'react';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { timeSpan } from '@/lib/perf';
import { AuthorizationError } from '@/modules/auth/errors';
import { getStorageAdapter } from '@/modules/catalog/storage';
import { SIGNED_URL_TTL_SECONDS } from '@/modules/catalog/image-config';
import { normalizeMessageBody } from './schemas';
import { MessageRejectedError } from './errors';
import {
  buildCounterparty,
  toPreview,
  type ConversationDTO,
  type ConversationListingDTO,
  type ConversationSummaryDTO,
  type MessageDTO,
  type Page,
} from './dto';
import {
  decodeMessageCursor,
  encodeMessageCursor,
  decodeSummaryCursor,
  encodeSummaryCursor,
} from './cursor';

/**
 * Messaging service — the ONLY sanctioned path for conversation/message reads
 * and writes.
 *
 * IDENTITY RULE: the participant is ALWAYS the server-verified user id passed in
 * by the caller (from getAuthContext); the client may supply a listingId, a
 * message body, and cursors, but NEVER a buyer/seller/sender id or conversation
 * ownership. Writes use the privileged Prisma connection with EXPLICIT
 * participant authorization; RLS (migration 0013) is the read-path backstop.
 *
 * Existence is never leaked: unauthorized access, a missing conversation, a
 * malformed id, and a non-public listing all collapse to the same 404.
 */

/** Page sizes (bounded — no query is ever unbounded). */
export const MESSAGES_PAGE_SIZE = 30;
export const SUMMARIES_PAGE_SIZE = 20;

type ParticipantRole = 'buyer' | 'seller';

/** A syntactically valid UUID. A malformed id is treated as "not found" rather
 * than reaching the database (where it would raise a type error). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConversationAccess {
  id: string;
  listingId: string | null; // null once the listing has been removed (SET NULL)
  buyerProfileId: string;
  sellerProfileId: string;
  role: ParticipantRole;
}

/**
 * The single reusable participant gate. Loads the conversation and verifies the
 * authenticated user is the buyer or the seller. Returns a compact access
 * context, or null for BOTH "not found" and "not a participant" so callers
 * cannot tell the two apart. Request-memoized so metadata + render share it.
 */
export const resolveConversationAccess = cache(
  async (
    userId: string,
    conversationId: string,
  ): Promise<ConversationAccess | null> => {
    if (!UUID_RE.test(conversationId)) return null; // malformed -> not found
    return timeSpan('db.conversationAccess', async () => {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          id: true,
          listingId: true,
          buyerProfileId: true,
          sellerProfileId: true,
        },
      });
      if (!conv) return null;
      if (conv.buyerProfileId === userId) return { ...conv, role: 'buyer' };
      if (conv.sellerProfileId === userId) return { ...conv, role: 'seller' };
      return null; // not a participant — indistinguishable from missing
    });
  },
);

/** Uniform not-found for missing / unauthorized / malformed access. */
function notFound(): never {
  throw new AuthorizationError(404, 'not_found');
}

/* ------------------------- create (idempotent) ---------------------------- */

/**
 * Get-or-create the conversation between the current user (buyer) and the seller
 * of a PUBLISHED listing. Idempotent and race-safe: the create relies on the
 * unique identity index (migration 0013); a concurrent winner is returned by
 * catching the unique violation. The seller id is derived from the listing
 * server-side — never from the client.
 *
 * Non-public / unknown listings all return the same 404, so conversation
 * creation cannot probe whether a draft/paused/archived/absent listing exists.
 */
export async function getOrCreateConversationForListing(
  userId: string,
  listingId: string,
): Promise<{ id: string; created: boolean }> {
  if (!UUID_RE.test(listingId)) notFound(); // malformed -> uniform not-found
  const listing = await timeSpan('db.listingForConversation', () =>
    prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        status: true,
        title: true,
        priceMinor: true,
        currency: true,
        seller: { select: { profileId: true } },
      },
    }),
  );

  // Only a currently-published listing may seed a NEW conversation. Every
  // non-public state is indistinguishable from "unknown".
  if (!listing || listing.status !== 'published') notFound();

  const sellerProfileId = listing.seller.profileId;
  if (sellerProfileId === userId) {
    // The seller cannot open a buyer-style conversation with their own listing.
    throw new AuthorizationError(403, 'cannot_message_own_listing');
  }

  const identity = {
    listingId_buyerProfileId_sellerProfileId: {
      listingId,
      buyerProfileId: userId,
      sellerProfileId,
    },
  };

  try {
    const created = await timeSpan('db.conversationCreate', () =>
      prisma.conversation.create({
        // Capture the immutable listing snapshot at creation, so the
        // conversation still shows what it was about if the listing is deleted.
        data: {
          listingId,
          buyerProfileId: userId,
          sellerProfileId,
          listingTitleSnapshot: listing.title,
          listingPriceMinorSnapshot: listing.priceMinor,
          listingCurrencySnapshot: listing.currency,
        },
        select: { id: true },
      }),
    );
    return { id: created.id, created: true };
  } catch (e) {
    // P2002 = unique violation on the identity index: a concurrent request won,
    // or this buyer already has a conversation for this listing. Return it.
    if ((e as { code?: string }).code === 'P2002') {
      const existing = await prisma.conversation.findUnique({
        where: identity,
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
    }
    throw e;
  }
}

/* ------------------------------ rich reads -------------------------------- */

const richConversationSelect = {
  id: true,
  buyerProfileId: true,
  sellerProfileId: true,
  lastMessageAt: true,
  // Immutable snapshot -- the fallback once the live listing is deleted.
  listingTitleSnapshot: true,
  listingPriceMinorSnapshot: true,
  listingCurrencySnapshot: true,
  listing: {
    select: {
      id: true,
      title: true,
      priceMinor: true,
      currency: true,
      status: true,
      images: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        take: 1,
        select: { storageKey: true },
      },
    },
  },
  buyer: { select: { displayName: true, avatarUrl: true } },
  seller: {
    select: {
      displayName: true,
      avatarUrl: true,
      sellerProfile: { select: { shopName: true, handle: true } },
    },
  },
} satisfies Prisma.ConversationSelect;

type RichConversation = Prisma.ConversationGetPayload<{
  select: typeof richConversationSelect;
}>;

/** Summary rows additionally carry the latest message for a preview. */
const summarySelect = {
  ...richConversationSelect,
  messages: {
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    select: { body: true },
  },
} satisfies Prisma.ConversationSelect;

/** Batch-sign cover keys in one round-trip; missing keys are simply absent. */
async function signCovers(keys: string[]): Promise<Map<string, string>> {
  if (keys.length === 0) return new Map();
  return timeSpan(
    'storage.sign',
    () => getStorageAdapter().createSignedUrls(keys, SIGNED_URL_TTL_SECONDS),
    { count: keys.length },
  );
}

function listingDto(
  row: RichConversation,
  signed: Map<string, string>,
): ConversationListingDTO {
  // The live listing is preferred while it exists; once deleted (listing_id set
  // to NULL by ON DELETE SET NULL), fall back to the immutable snapshot.
  if (!row.listing) {
    return {
      id: null,
      title: row.listingTitleSnapshot,
      priceMinor: row.listingPriceMinorSnapshot,
      currency: row.listingCurrencySnapshot,
      status: 'removed',
      coverUrl: null,
    };
  }
  const listing = row.listing;
  const key = listing.images[0]?.storageKey;
  return {
    id: listing.id,
    title: listing.title,
    priceMinor: listing.priceMinor,
    currency: listing.currency,
    status: listing.status,
    coverUrl: key ? (signed.get(key) ?? null) : null,
  };
}

function baseConversationDto(
  row: RichConversation,
  role: ParticipantRole,
  signed: Map<string, string>,
): ConversationDTO {
  return {
    id: row.id,
    listing: listingDto(row, signed),
    counterparty: buildCounterparty(role, row.buyer, row.seller),
    lastActivityAt: row.lastMessageAt,
  };
}

/**
 * The single conversation for the current participant, as a DTO, or null when
 * missing / not a participant / malformed id (caller renders not-found).
 */
export async function getConversationForCurrentUser(
  userId: string,
  conversationId: string,
): Promise<ConversationDTO | null> {
  const access = await resolveConversationAccess(userId, conversationId);
  if (!access) return null;

  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: richConversationSelect,
  });
  if (!row) return null;

  const key = row.listing?.images[0]?.storageKey;
  const signed = await signCovers(key ? [key] : []);
  return baseConversationDto(row, access.role, signed);
}

/* ------------------------------- messages --------------------------------- */

function messageDto(
  m: { id: string; body: string; createdAt: Date; senderProfileId: string },
  userId: string,
): MessageDTO {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    sentByViewer: m.senderProfileId === userId,
  };
}

/**
 * A conversation's messages in deterministic chronological order
 * (created_at ASC, id ASC), keyset-paginated. Participant-gated; bounded.
 */
export async function listConversationMessages(
  userId: string,
  conversationId: string,
  cursor?: string,
): Promise<Page<MessageDTO>> {
  const access = await resolveConversationAccess(userId, conversationId);
  if (!access) notFound();

  const cur = decodeMessageCursor(cursor, conversationId);
  const rows = await timeSpan('db.messages', () =>
    prisma.message.findMany({
      where: {
        conversationId,
        ...(cur
          ? {
              OR: [
                { createdAt: { gt: new Date(cur.createdAt) } },
                { createdAt: new Date(cur.createdAt), id: { gt: cur.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MESSAGES_PAGE_SIZE + 1,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderProfileId: true,
      },
    }),
  );

  const items = rows.slice(0, MESSAGES_PAGE_SIZE);
  const last = items[items.length - 1];
  const nextCursor =
    rows.length > MESSAGES_PAGE_SIZE && last
      ? encodeMessageCursor(conversationId, {
          createdAt: last.createdAt.toISOString(),
          id: last.id,
        })
      : null;

  return { items: items.map((m) => messageDto(m, userId)), nextCursor };
}

/** A thread page: messages ASCENDING within the window, plus a cursor to load
 * strictly-older history. `olderCursor` is null when the start of history is
 * reached. */
export interface ThreadMessagePage {
  items: MessageDTO[];
  olderCursor: string | null;
}

/**
 * Messages for the conversation THREAD view. Pages backward from the newest:
 * the first call returns the most recent {@link MESSAGES_PAGE_SIZE} messages,
 * and `olderCursor` walks strictly-older history. Items are returned ASCENDING
 * (oldest→newest) within each window so the thread reads top-to-bottom.
 *
 * Deterministic keyset on (created_at, id): the query orders DESC and compares
 * strictly `< cursor`, so there are no duplicates or skips across pages (the
 * boundary row is excluded, and equal timestamps break by id). Reuses the same
 * conversation-bound cursor codec as {@link listConversationMessages} — a cursor
 * minted for another conversation is rejected.
 */
export async function listRecentConversationMessages(
  userId: string,
  conversationId: string,
  cursor?: string,
): Promise<ThreadMessagePage> {
  const access = await resolveConversationAccess(userId, conversationId);
  if (!access) notFound();

  const cur = decodeMessageCursor(cursor, conversationId);
  const rows = await timeSpan('db.messagesRecent', () =>
    prisma.message.findMany({
      where: {
        conversationId,
        ...(cur
          ? {
              OR: [
                { createdAt: { lt: new Date(cur.createdAt) } },
                { createdAt: new Date(cur.createdAt), id: { lt: cur.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MESSAGES_PAGE_SIZE + 1,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderProfileId: true,
      },
    }),
  );

  const hasOlder = rows.length > MESSAGES_PAGE_SIZE;
  const pageDesc = rows.slice(0, MESSAGES_PAGE_SIZE); // newest → oldest
  const oldestInPage = pageDesc[pageDesc.length - 1];
  const olderCursor =
    hasOlder && oldestInPage
      ? encodeMessageCursor(conversationId, {
          createdAt: oldestInPage.createdAt.toISOString(),
          id: oldestInPage.id,
        })
      : null;

  // Ascending for display (oldest at the top of the window, newest at the bottom).
  const ascending = [...pageDesc].reverse();
  return { items: ascending.map((m) => messageDto(m, userId)), olderCursor };
}

/**
 * Send a message as the current participant. Validates + normalises the body,
 * then inserts with the verified sender id. A DB trigger enforces that the
 * sender is a participant and bumps the conversation's activity atomically.
 *
 * IDEMPOTENCY: pass a valid UUID `clientSubmissionId` (an opaque token — never
 * an identity) to make retries/replays safe. The sender-scoped unique index
 * (migration 0015) rejects a duplicate insert; on that conflict the already-
 * stored participant-authorised message is returned instead, and no second
 * activity bump occurs (the trigger only fires on a successful insert). A
 * missing/malformed token falls back to a plain, non-idempotent insert.
 */
export async function sendConversationMessage(
  userId: string,
  conversationId: string,
  body: unknown,
  clientSubmissionId?: string,
): Promise<MessageDTO> {
  const access = await resolveConversationAccess(userId, conversationId);
  if (!access) notFound();

  const parsed = normalizeMessageBody(body);
  if (!parsed.ok) throw new MessageRejectedError(parsed.reason);

  // The token is ONLY a dedup key. Ignore anything that isn't a UUID.
  const token =
    typeof clientSubmissionId === 'string' && UUID_RE.test(clientSubmissionId)
      ? clientSubmissionId
      : null;

  const select = {
    id: true,
    body: true,
    createdAt: true,
    senderProfileId: true,
  } as const;

  try {
    const created = await timeSpan('db.messageCreate', () =>
      prisma.message.create({
        data: {
          conversationId,
          senderProfileId: userId,
          body: parsed.value,
          clientSubmissionId: token,
        },
        select,
      }),
    );
    return messageDto(created, userId);
  } catch (e) {
    // P2002 on the submission index = a retry/replay of the same token by the
    // same sender. Return the winning message; do NOT insert (so no double bump).
    if (token && (e as { code?: string }).code === 'P2002') {
      const existing = await prisma.message.findFirst({
        where: {
          conversationId,
          senderProfileId: userId,
          clientSubmissionId: token,
        },
        select,
      });
      if (existing) return messageDto(existing, userId);
    }
    throw e;
  }
}

/* ------------------------------ summaries --------------------------------- */

/**
 * The current user's conversations (as buyer OR seller), newest-activity first
 * (last_message_at DESC, id DESC), keyset-paginated. Cover URLs for the page are
 * batch-signed in a single round-trip. Bounded.
 */
export async function listConversationSummariesForCurrentUser(
  userId: string,
  cursor?: string,
): Promise<Page<ConversationSummaryDTO>> {
  const cur = decodeSummaryCursor(cursor, userId);

  const rows = await timeSpan('db.conversations', () =>
    prisma.conversation.findMany({
      where: {
        AND: [
          { OR: [{ buyerProfileId: userId }, { sellerProfileId: userId }] },
          ...(cur
            ? [
                {
                  OR: [
                    { lastMessageAt: { lt: new Date(cur.lastMessageAt) } },
                    {
                      lastMessageAt: new Date(cur.lastMessageAt),
                      id: { lt: cur.id },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: SUMMARIES_PAGE_SIZE + 1,
      select: summarySelect,
    }),
  );

  const page = rows.slice(0, SUMMARIES_PAGE_SIZE);
  const coverKeys = page
    .map((r) => r.listing?.images[0]?.storageKey)
    .filter((k): k is string => Boolean(k));
  const signed = await signCovers(coverKeys);

  const items: ConversationSummaryDTO[] = page.map((row) => {
    const role: ParticipantRole =
      row.buyerProfileId === userId ? 'buyer' : 'seller';
    const preview = row.messages[0] ? toPreview(row.messages[0].body) : null;
    return {
      ...baseConversationDto(row, role, signed),
      lastMessagePreview: preview,
    };
  });

  const last = page[page.length - 1];
  const nextCursor =
    rows.length > SUMMARIES_PAGE_SIZE && last
      ? encodeSummaryCursor(userId, {
          lastMessageAt: last.lastMessageAt.toISOString(),
          id: last.id,
        })
      : null;

  return { items, nextCursor };
}
