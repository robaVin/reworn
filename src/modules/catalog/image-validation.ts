import { MAX_UPLOAD_BYTES } from './image-config';

/**
 * File-signature (magic-byte) image validation — pure and dependency-free.
 *
 * The declared MIME from the browser is untrusted, so we sniff the actual bytes
 * and require them to match. JPEG/PNG/WebP are accepted; SVG and GIF are
 * explicitly rejected (SVG can carry script; GIF is out of scope).
 */

export type DetectedFormat =
  'jpeg' | 'png' | 'webp' | 'gif' | 'svg' | 'unknown';

const ACCEPTED = new Set<DetectedFormat>(['jpeg', 'png', 'webp']);

/** Detects the real image format from the leading bytes. */
export function detectFormat(bytes: Uint8Array): DetectedFormat {
  const b = bytes;
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return 'jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return 'png';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  ) {
    return 'webp';
  }
  // GIF: "GIF87a" / "GIF89a"
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return 'gif';
  }
  // SVG: XML/text starting with <?xml or containing <svg near the top.
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.subarray(0, 256))
    .toLowerCase()
    .trimStart();
  if (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    head.includes('<svg')
  ) {
    return 'svg';
  }
  return 'unknown';
}

export interface ImageValidationResult {
  ok: boolean;
  format: DetectedFormat;
  reason?: string;
}

const MIME_BY_FORMAT: Record<string, string[]> = {
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
};

/**
 * Validates size, real format, and declared-MIME consistency.
 * @param bytes leading bytes of the file (>= 16 recommended)
 * @param declaredMime the browser-declared content type (untrusted)
 * @param byteLength the full file size in bytes
 */
export function validateImageBytes(
  bytes: Uint8Array,
  declaredMime: string | undefined,
  byteLength: number,
): ImageValidationResult {
  if (byteLength <= 0) return { ok: false, format: 'unknown', reason: 'empty' };
  if (byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, format: 'unknown', reason: 'too_large' };
  }

  const format = detectFormat(bytes);

  if (format === 'svg' || format === 'gif') {
    return { ok: false, format, reason: `rejected_format:${format}` };
  }
  if (!ACCEPTED.has(format)) {
    return { ok: false, format, reason: 'unrecognized_format' };
  }

  // Spoof detection: a declared MIME must agree with the real bytes.
  if (declaredMime) {
    const allowed = MIME_BY_FORMAT[format] ?? [];
    if (!allowed.includes(declaredMime.toLowerCase())) {
      return { ok: false, format, reason: 'mime_signature_mismatch' };
    }
  }

  return { ok: true, format };
}
