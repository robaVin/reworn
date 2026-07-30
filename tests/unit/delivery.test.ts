import { describe, it, expect } from 'vitest';
import {
  deliveryMethodLabel,
  hasDisallowedControlChar,
  DELIVERY_NOTE_MAX,
} from '@/modules/catalog/delivery';

describe('deliveryMethodLabel', () => {
  it('maps every method to its public label', () => {
    expect(deliveryMethodLabel('unspecified')).toBe(
      'Arrange delivery directly with the seller',
    );
    expect(deliveryMethodLabel('shipping')).toBe('Shipping available');
    expect(deliveryMethodLabel('pickup')).toBe('Collection available');
    expect(deliveryMethodLabel('both')).toBe(
      'Shipping or collection available',
    );
  });

  it('falls back to the unspecified label for an unknown value', () => {
    expect(deliveryMethodLabel('bogus')).toBe(
      'Arrange delivery directly with the seller',
    );
  });
});

describe('hasDisallowedControlChar', () => {
  it('permits printable text, tabs, and newlines (multiline notes)', () => {
    expect(hasDisallowedControlChar('Ships from Skopje')).toBe(false);
    expect(
      hasDisallowedControlChar(
        `Line one${String.fromCharCode(10)}Line two${String.fromCharCode(9)}tabbed`,
      ),
    ).toBe(false);
    expect(hasDisallowedControlChar(String.fromCharCode(13))).toBe(false); // CR
  });

  it('rejects other C0 control characters and DEL', () => {
    expect(hasDisallowedControlChar(String.fromCharCode(0))).toBe(true); // NUL
    expect(hasDisallowedControlChar(String.fromCharCode(7))).toBe(true); // BEL
    expect(hasDisallowedControlChar(String.fromCharCode(27))).toBe(true); // ESC
    expect(hasDisallowedControlChar(String.fromCharCode(127))).toBe(true); // DEL
  });

  it('documents a maximum length', () => {
    expect(DELIVERY_NOTE_MAX).toBe(200);
  });
});
