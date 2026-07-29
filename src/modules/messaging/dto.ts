/**
 * Messaging DTOs — the ONLY message/conversation shapes that leave the module.
 *
 * Privacy contract (asserted by tests): these expose only what a participant
 * needs. They NEVER carry profile ids (buyer/seller/sender), auth user ids,
 * emails, seller internal ids, subscription/payment data, RLS helper fields, or
 * the listing's internal owner id. A message's authorship is conveyed as the
 * boolean `sentByViewer`, not the sender's id.
 */

/** Single-line preview length for a conversation summary. */
export const PREVIEW_MAX = 140;

/** Fallback label when a buyer has not set a public display name. */
export const BUYER_FALLBACK_LABEL = 'ReWorn member';

export interface CounterpartyDTO {
  /** Which side the OTHER participant is, from the viewer's perspective. */
  kind: 'buyer' | 'seller';
  /** Shop name (seller) or self-chosen display name (buyer), never an email/id. */
  displayName: string;
  /** Public shop handle — present only when the counterparty is the seller. */
  handle?: string;
  /** Public avatar URL, when the profile has one. */
  avatarUrl?: string;
}

export interface ConversationListingDTO {
  /** Live listing id, or null when the listing has been removed (SET NULL). */
  id: string | null;
  /** Live title while the listing exists; the snapshot title once it is gone. */
  title: string;
  priceMinor: number | null;
  currency: string;
  /** Listing lifecycle status — shown to participants so a paused/archived
   * listing can be labelled — or 'removed' when the live listing is gone. Not
   * routed through the public listing service. */
  status: string;
  coverUrl: string | null;
}

export interface ConversationDTO {
  id: string;
  listing: ConversationListingDTO;
  counterparty: CounterpartyDTO;
  lastActivityAt: Date;
}

export interface ConversationSummaryDTO extends ConversationDTO {
  /** First line of the latest message, truncated; null if none yet. */
  lastMessagePreview: string | null;
}

export interface MessageDTO {
  id: string;
  body: string;
  createdAt: Date;
  /** True when the authenticated viewer is the author (no sender id exposed). */
  sentByViewer: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Collapse newlines to spaces and truncate for a single-line preview. */
export function toPreview(body: string): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= PREVIEW_MAX) return oneLine;
  return `${oneLine.slice(0, PREVIEW_MAX - 1)}…`;
}

/** Minimal profile fields needed to render a counterparty. */
interface ProfileFacet {
  displayName: string | null;
  avatarUrl: string | null;
  sellerProfile?: { shopName: string; handle: string } | null;
}

/**
 * Build the counterparty DTO from the viewer's role and both participants'
 * profile facets. When the viewer is the seller, the counterparty is the buyer
 * (self-chosen display name or a neutral fallback — never email/id). When the
 * viewer is the buyer, the counterparty is the seller (shop name + handle).
 */
export function buildCounterparty(
  viewerRole: 'buyer' | 'seller',
  buyer: ProfileFacet,
  seller: ProfileFacet,
): CounterpartyDTO {
  if (viewerRole === 'buyer') {
    // Counterparty is the seller.
    const shop = seller.sellerProfile;
    return {
      kind: 'seller',
      displayName: shop?.shopName ?? seller.displayName ?? 'Shop',
      ...(shop?.handle ? { handle: shop.handle } : {}),
      ...(seller.avatarUrl ? { avatarUrl: seller.avatarUrl } : {}),
    };
  }
  // Counterparty is the buyer.
  return {
    kind: 'buyer',
    displayName: buyer.displayName ?? BUYER_FALLBACK_LABEL,
    ...(buyer.avatarUrl ? { avatarUrl: buyer.avatarUrl } : {}),
  };
}
