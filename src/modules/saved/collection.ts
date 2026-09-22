import 'server-only';

import { getAuthContext } from '@/modules/auth/session';
import { getSavedListingIds } from './service';

/**
 * Saved-state for a rendered listing collection, in ONE bounded query.
 *
 * Anonymous viewers make NO SavedItem query (they can't have saved anything);
 * authenticated viewers get a single `getSavedListingIds` over exactly the ids
 * on the page — never one lookup per card. Returns what `ListingGrid` needs.
 */
export async function savedStateForCards(
  cards: ReadonlyArray<{ id: string }>,
): Promise<{ savedIds?: Set<string>; authenticated: boolean }> {
  const auth = await getAuthContext();
  if (!auth) return { authenticated: false };
  const savedIds = await getSavedListingIds(
    auth.userId,
    cards.map((c) => c.id),
  );
  return { savedIds, authenticated: true };
}
