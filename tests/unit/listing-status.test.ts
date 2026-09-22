import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  availableTransitions,
  canApply,
  isEditable,
  isPubliclyVisible,
  InvalidListingTransitionError,
  type ListingStatus,
  type ListingTransition,
} from '@/modules/catalog/listing-status';

describe('listing state machine', () => {
  const legal: Array<[ListingStatus, ListingTransition, ListingStatus]> = [
    ['draft', 'publish', 'published'],
    ['draft', 'archive', 'archived'],
    ['published', 'pause', 'paused'],
    ['published', 'markSold', 'sold'],
    ['published', 'archive', 'archived'],
    ['paused', 'republish', 'published'],
    ['paused', 'markSold', 'sold'],
    ['paused', 'archive', 'archived'],
    ['sold', 'markAvailable', 'published'],
    ['sold', 'archive', 'archived'],
    ['archived', 'relist', 'draft'],
  ];

  it.each(legal)('%s --%s--> %s', (from, action, to) => {
    expect(applyTransition(from, action)).toBe(to);
    expect(canApply(from, action)).toBe(true);
  });

  const illegal: Array<[ListingStatus, ListingTransition]> = [
    ['draft', 'pause'],
    ['draft', 'republish'],
    ['draft', 'relist'],
    ['draft', 'markSold'],
    ['published', 'publish'],
    ['published', 'relist'],
    ['published', 'markAvailable'],
    ['paused', 'pause'],
    ['sold', 'markSold'],
    ['sold', 'pause'],
    ['sold', 'publish'],
    ['sold', 'relist'],
    ['archived', 'publish'],
    ['archived', 'markSold'],
    ['archived', 'markAvailable'],
    ['archived', 'archive'],
  ];

  it.each(illegal)('rejects %s --%s-->', (from, action) => {
    expect(canApply(from, action)).toBe(false);
    expect(() => applyTransition(from, action)).toThrow(
      InvalidListingTransitionError,
    );
  });

  it('availableTransitions lists only legal actions', () => {
    expect(availableTransitions('draft').sort()).toEqual([
      'archive',
      'publish',
    ]);
    expect(availableTransitions('published').sort()).toEqual([
      'archive',
      'markSold',
      'pause',
    ]);
    expect(availableTransitions('paused').sort()).toEqual([
      'archive',
      'markSold',
      'republish',
    ]);
    expect(availableTransitions('sold').sort()).toEqual([
      'archive',
      'markAvailable',
    ]);
    expect(availableTransitions('archived')).toEqual(['relist']);
  });

  it('only published is publicly visible (sold is NOT available inventory)', () => {
    expect(isPubliclyVisible('published')).toBe(true);
    for (const s of [
      'draft',
      'paused',
      'sold',
      'archived',
    ] as ListingStatus[]) {
      expect(isPubliclyVisible(s)).toBe(false);
    }
  });

  it('draft and paused are editable; published/sold/archived are not', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('paused')).toBe(true);
    expect(isEditable('published')).toBe(false);
    expect(isEditable('sold')).toBe(false);
    expect(isEditable('archived')).toBe(false);
  });
});
