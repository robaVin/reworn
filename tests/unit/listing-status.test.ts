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
    ['published', 'archive', 'archived'],
    ['paused', 'republish', 'published'],
    ['paused', 'archive', 'archived'],
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
    ['published', 'publish'],
    ['published', 'relist'],
    ['paused', 'pause'],
    ['archived', 'publish'],
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
      'pause',
    ]);
    expect(availableTransitions('archived')).toEqual(['relist']);
  });

  it('only published is publicly visible', () => {
    expect(isPubliclyVisible('published')).toBe(true);
    for (const s of ['draft', 'paused', 'archived'] as ListingStatus[]) {
      expect(isPubliclyVisible(s)).toBe(false);
    }
  });

  it('draft and paused are editable; published and archived are not', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('paused')).toBe(true);
    expect(isEditable('published')).toBe(false);
    expect(isEditable('archived')).toBe(false);
  });
});
