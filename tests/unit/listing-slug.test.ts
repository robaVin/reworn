import { describe, it, expect } from 'vitest';
import {
  slugifyListingTitle,
  slugCodeFromId,
  buildListingSlug,
  SLUG_TITLE_MAX,
} from '@/modules/catalog/listing-slug';

/**
 * Pure product-slug rules. The SQL backfill in migration 0018 mirrors the
 * human-part logic; the id-derived code guarantees uniqueness.
 */

describe('slugifyListingTitle', () => {
  it('kebab-cases and lowercases', () => {
    expect(slugifyListingTitle('Wool Overcoat')).toBe('wool-overcoat');
  });

  it('collapses runs of non-alphanumerics to a single hyphen and trims', () => {
    expect(slugifyListingTitle('  Silk   //  Slip__Dress! ')).toBe(
      'silk-slip-dress',
    );
  });

  it('strips diacritics to ASCII', () => {
    expect(slugifyListingTitle('Maison Kré Écru')).toBe('maison-kre-ecru');
  });

  it('never returns empty (punctuation / non-Latin title)', () => {
    expect(slugifyListingTitle('!!!')).toBe('listing');
    expect(slugifyListingTitle('女装外套')).toBe('listing');
    expect(slugifyListingTitle('')).toBe('listing');
  });

  it('caps the human part and never leaves a trailing hyphen', () => {
    const long = 'a'.repeat(100);
    const out = slugifyListingTitle(long);
    expect(out.length).toBeLessThanOrEqual(SLUG_TITLE_MAX);
    // A title whose 60-char boundary lands on a hyphen must not keep it.
    const hyphenBoundary = `${'word '.repeat(20)}`; // hyphens every 4 chars
    expect(slugifyListingTitle(hyphenBoundary).endsWith('-')).toBe(false);
  });
});

describe('slugCodeFromId', () => {
  const id = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
  it('strips dashes, lowercases, and takes the first N hex chars', () => {
    expect(slugCodeFromId(id)).toBe('1a2b3c4d');
    expect(slugCodeFromId(id, 16)).toBe('1a2b3c4d5e6f4a8b');
  });
  it('a full-length code is the entire id hex (guaranteed unique)', () => {
    expect(slugCodeFromId(id, 32)).toBe('1a2b3c4d5e6f4a8b9c0d1e2f3a4b5c6d');
  });
});

describe('buildListingSlug', () => {
  const id = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
  it('joins the kebab title and the id-derived code', () => {
    expect(buildListingSlug(id, 'Wool Overcoat')).toBe(
      'wool-overcoat-1a2b3c4d',
    );
  });
  it('is deterministic in (id, title, codeLen)', () => {
    expect(buildListingSlug(id, 'Wool Overcoat')).toBe(
      buildListingSlug(id, 'Wool Overcoat'),
    );
    expect(buildListingSlug(id, 'Wool Overcoat', 16)).toBe(
      'wool-overcoat-1a2b3c4d5e6f4a8b',
    );
  });
});
