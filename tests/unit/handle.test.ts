import { describe, it, expect } from 'vitest';
import {
  isValidHandle,
  slugifyHandleBase,
  normalizeHandle,
  RESERVED_HANDLES,
} from '@/modules/catalog/handle';

describe('handle validation', () => {
  it('accepts well-formed handles', () => {
    for (const h of ['aurora-vintage', 'bee2', 'a1b', 'x'.repeat(30)]) {
      expect(isValidHandle(h)).toBe(true);
    }
  });

  it('rejects malformed handles', () => {
    for (const h of [
      'ab', // too short
      'x'.repeat(31), // too long
      '-lead',
      'trail-',
      'UPPER',
      'has space',
      'em--dash', // consecutive hyphens
      'weird_underscore',
    ]) {
      expect(isValidHandle(h)).toBe(false);
    }
  });

  it('rejects every reserved handle', () => {
    for (const r of RESERVED_HANDLES) expect(isValidHandle(r)).toBe(false);
    expect(isValidHandle('admin')).toBe(false);
    expect(isValidHandle('shop')).toBe(false);
  });
});

describe('slugifyHandleBase', () => {
  it('lowercases, strips punctuation and collapses hyphens', () => {
    expect(slugifyHandleBase('Aurora  Vintage!!')).toBe('aurora-vintage');
    expect(slugifyHandleBase("Bee's Boutique")).toBe('bee-s-boutique');
  });

  it('strips accents', () => {
    expect(slugifyHandleBase('Café Déjà')).toBe('cafe-deja');
  });

  it('pads too-short results and never yields empty', () => {
    expect(slugifyHandleBase('!!').length).toBeGreaterThanOrEqual(3);
    expect(slugifyHandleBase('a')).toBe('a-shop');
    expect(slugifyHandleBase('')).toBe('seller');
  });

  it('truncates to the max length without a trailing hyphen', () => {
    const s = slugifyHandleBase('x'.repeat(60));
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('normalizeHandle', () => {
  it('is case-insensitive and trims', () => {
    expect(normalizeHandle('  AURORA-Vintage ')).toBe('aurora-vintage');
  });
});
