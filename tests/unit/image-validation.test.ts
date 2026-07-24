import { describe, it, expect } from 'vitest';
import {
  detectFormat,
  validateImageBytes,
} from '@/modules/catalog/image-validation';
import { MAX_UPLOAD_BYTES } from '@/modules/catalog/image-config';

/**
 * Pure file-signature (magic-byte) validation. No sharp / native deps, so this
 * runs everywhere. Covers accepted formats, explicit SVG/GIF rejection, spoofed
 * MIME detection, and size bounds — the untrusted-input gate that runs BEFORE
 * any image processing.
 */

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
const SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const XML_SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg></svg>');

describe('detectFormat', () => {
  it('detects the accepted raster formats', () => {
    expect(detectFormat(JPEG)).toBe('jpeg');
    expect(detectFormat(PNG)).toBe('png');
    expect(detectFormat(WEBP)).toBe('webp');
  });

  it('detects GIF and SVG (both rejected downstream)', () => {
    expect(detectFormat(GIF)).toBe('gif');
    expect(detectFormat(SVG)).toBe('svg');
    expect(detectFormat(XML_SVG)).toBe('svg');
  });

  it('returns unknown for arbitrary bytes', () => {
    expect(detectFormat(Uint8Array.from([0x00, 0x01, 0x02, 0x03]))).toBe(
      'unknown',
    );
  });
});

describe('validateImageBytes', () => {
  it('accepts a valid JPEG/PNG/WebP with matching declared MIME', () => {
    expect(validateImageBytes(JPEG, 'image/jpeg', 1024)).toMatchObject({
      ok: true,
      format: 'jpeg',
    });
    expect(validateImageBytes(PNG, 'image/png', 1024).ok).toBe(true);
    expect(validateImageBytes(WEBP, 'image/webp', 1024).ok).toBe(true);
  });

  it('accepts when no MIME is declared (bytes are authoritative)', () => {
    expect(validateImageBytes(JPEG, undefined, 1024).ok).toBe(true);
  });

  it('rejects a spoofed MIME that disagrees with the real bytes', () => {
    const res = validateImageBytes(PNG, 'image/jpeg', 1024);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('mime_signature_mismatch');
  });

  it('rejects SVG explicitly (script-carrying)', () => {
    const res = validateImageBytes(SVG, 'image/svg+xml', 1024);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('rejected_format:svg');
  });

  it('rejects GIF explicitly (out of scope)', () => {
    const res = validateImageBytes(GIF, 'image/gif', 1024);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('rejected_format:gif');
  });

  it('rejects an unrecognized binary blob', () => {
    const res = validateImageBytes(
      Uint8Array.from([0x00, 0x11, 0x22, 0x33]),
      undefined,
      1024,
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unrecognized_format');
  });

  it('rejects empty and oversized uploads', () => {
    expect(validateImageBytes(JPEG, 'image/jpeg', 0).reason).toBe('empty');
    expect(
      validateImageBytes(JPEG, 'image/jpeg', MAX_UPLOAD_BYTES + 1).reason,
    ).toBe('too_large');
  });
});
