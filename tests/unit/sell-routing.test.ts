import { describe, it, expect } from 'vitest';
import { resolveSellDestination } from '@/modules/catalog/sell-routing';

/**
 * /sell routing outcomes (pure). Covers every authenticated branch so the
 * concurrent roles ∥ seller-access refactor cannot change a routing decision.
 */
describe('resolveSellDestination', () => {
  it('buyer (no seller role) → onboarding', () => {
    expect(
      resolveSellDestination({
        canActAsSeller: false,
        seller: null,
        canPublish: false,
      }),
    ).toBe('buyer_onboarding');
  });

  it('seller role but no profile → profile required', () => {
    expect(
      resolveSellDestination({
        canActAsSeller: true,
        seller: null,
        canPublish: false,
      }),
    ).toBe('profile_required');
  });

  it('seller profile not active → not active', () => {
    expect(
      resolveSellDestination({
        canActAsSeller: true,
        seller: { status: 'frozen' },
        canPublish: false,
      }),
    ).toBe('seller_not_active');
  });

  it('unenforced dev access (active seller, canPublish) → create', () => {
    // enforcement off ⇒ getSellerAccess sets canPublish=true for an active seller
    expect(
      resolveSellDestination({
        canActAsSeller: true,
        seller: { status: 'active' },
        canPublish: true,
      }),
    ).toBe('create');
  });

  it('enforced unsubscribed seller (active, !canPublish) → subscription required', () => {
    expect(
      resolveSellDestination({
        canActAsSeller: true,
        seller: { status: 'active' },
        canPublish: false,
      }),
    ).toBe('subscription_required');
  });

  it('subscribed active seller (canPublish) → create', () => {
    expect(
      resolveSellDestination({
        canActAsSeller: true,
        seller: { status: 'active' },
        canPublish: true,
      }),
    ).toBe('create');
  });
});
