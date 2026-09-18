import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_HTML_LANG,
  normalizeLocale,
  isLocale,
} from '@/i18n/config';

/**
 * i18n foundation tests: locale config, catalog parity (the guarantee behind
 * "missing translation falls back safely"), and correct UTF-8 / Cyrillic
 * rendering. Translation-wiring of the header is covered in header-nav.test.ts.
 */

function catalog(locale: string): Record<string, Record<string, unknown>> {
  const path = fileURLToPath(
    new URL(`../../messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** All leaf key paths in a nested object, dot-joined and sorted. */
function keyPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>)
    .flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k))
    .sort();
}

describe('locale config', () => {
  it('ships exactly English, Albanian, Macedonian; English is the default', () => {
    expect([...LOCALES]).toEqual(['en', 'sq', 'mk']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('names each language in itself (endonyms), Macedonian in Cyrillic', () => {
    expect(LOCALE_LABELS.en).toBe('English');
    expect(LOCALE_LABELS.sq).toBe('Shqip');
    expect(LOCALE_LABELS.mk).toBe('Македонски');
    expect(LOCALE_HTML_LANG).toEqual({ en: 'en', sq: 'sq', mk: 'mk' });
  });

  it('normalizeLocale accepts supported locales and falls back to English', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('sq')).toBe('sq');
    expect(normalizeLocale('mk')).toBe('mk');
    // Unknown / empty / tampered → default (never throws).
    expect(normalizeLocale('de')).toBe('en');
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale('../../etc')).toBe('en');
  });

  it('isLocale is a correct type guard', () => {
    expect(isLocale('mk')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('catalog parity (fallback safety)', () => {
  const en = keyPaths(catalog('en'));

  it('English catalog is non-empty and namespaced', () => {
    expect(en.length).toBeGreaterThan(0);
    expect(en).toContain('Nav.messages');
    expect(en).toContain('Announcement.message');
  });

  it.each(['sq', 'mk'])(
    '%s has exactly the same keys as English (no missing, no orphan)',
    (locale) => {
      expect(keyPaths(catalog(locale))).toEqual(en);
    },
  );

  it('no translated value is left as an empty string', () => {
    for (const locale of LOCALES) {
      const flat = JSON.stringify(catalog(locale));
      expect(flat).not.toContain('""');
    }
  });
});

describe('character rendering (UTF-8)', () => {
  it('Albanian catalog contains ë/ç correctly (UTF-8 round-trip)', () => {
    const sq = JSON.stringify(catalog('sq'));
    expect(sq).toMatch(/[ëç]/);
    // Concrete strings that must carry the diacritics.
    const cat = catalog('sq');
    expect(String(cat.Common?.retry)).toBe('Provo përsëri');
    expect(String(cat.Announcement?.message)).toContain('çdo');
  });

  it('Macedonian catalog is Cyrillic, not Latin transliteration', () => {
    const mk = catalog('mk');
    // Every Macedonian value should contain Cyrillic and no ASCII letters
    // (brand/technical exceptions aside — these UI strings have none).
    expect(String(mk.Nav?.messages)).toBe('Пораки');
    expect(/[Ѐ-ӿ]/.test(String(mk.Announcement?.message))).toBe(true);
    // A distinctly Macedonian-Cyrillic letter appears somewhere in the catalog.
    expect(/[ѓќљњџЅ]/.test(JSON.stringify(mk))).toBe(true);
  });
});
