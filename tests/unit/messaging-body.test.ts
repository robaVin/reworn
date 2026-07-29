import { describe, it, expect } from 'vitest';
import {
  normalizeMessageBody,
  codePointLength,
  MAX_MESSAGE_LENGTH,
} from '@/modules/messaging/schemas';

// The single canonical helper. `ok`/`reason` unwrap its discriminated result.
const ok = (raw: string): string => {
  const r = normalizeMessageBody(raw);
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.value;
};
const reason = (raw: unknown): string | null => {
  const r = normalizeMessageBody(raw);
  return r.ok ? null : r.reason;
};

describe('normalizeMessageBody — normalization', () => {
  it('normalizes CRLF and lone CR to LF', () => {
    expect(ok('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('trims surrounding whitespace but preserves internal newlines', () => {
    expect(ok('  \n hello\n\nworld \n ')).toBe('hello\n\nworld');
  });
});

describe('normalizeMessageBody — rejects', () => {
  it('rejects a non-string', () => {
    expect(reason(42)).toBe('not_a_string');
    expect(reason(null)).toBe('not_a_string');
    expect(reason(undefined)).toBe('not_a_string');
  });

  it('rejects an empty body', () => {
    expect(reason('')).toBe('empty');
  });

  it('rejects a whitespace-only body', () => {
    expect(reason('   \n\t  ')).toBe('empty');
  });

  it('rejects unsupported control characters (NUL, BEL, VT, FF, US, DEL)', () => {
    // Built from code points so the source file stays free of raw control bytes.
    const disallowed = [0x00, 0x07, 0x0b, 0x0c, 0x1f, 0x7f].map((c) =>
      String.fromCharCode(c),
    );
    for (const c of disallowed) {
      expect(reason(`hi${c}there`)).toBe('control_char');
    }
  });

  it('rejects a body longer than the maximum (by code points)', () => {
    expect(reason('a'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe('too_long');
  });
});

describe('normalizeMessageBody — accepts', () => {
  it('accepts a normal message and returns it normalized', () => {
    expect(ok('  Hello there  ')).toBe('Hello there');
  });

  it('allows TAB and internal newlines', () => {
    expect(ok('line1\n\tindented\nline3')).toBe('line1\n\tindented\nline3');
  });

  it('accepts exactly the maximum length', () => {
    const body = 'a'.repeat(MAX_MESSAGE_LENGTH);
    expect(ok(body)).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('accepts Unicode and emoji', () => {
    expect(ok('Ćao! Волна палто 🧥✨')).toBe('Ćao! Волна палто 🧥✨');
  });

  it('counts emoji by code point, matching Postgres char_length', () => {
    // An astral emoji is length 2 in UTF-16 units but 1 code point.
    expect('🧥'.length).toBe(2);
    expect(codePointLength('🧥')).toBe(1);
    // MAX code points of emoji is accepted even though .length is 2x.
    const body = '🧥'.repeat(MAX_MESSAGE_LENGTH);
    expect(ok(body)).toBeTruthy();
    // One more code point over the limit is rejected.
    expect(reason('🧥'.repeat(MAX_MESSAGE_LENGTH + 1))).toBe('too_long');
  });
});
