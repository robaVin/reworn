import 'server-only';

import {
  MIN_DIMENSION,
  MAX_DIMENSION,
  TARGET_MAX_DIMENSION,
  OUTPUT_MIME,
} from './image-config';

// `sharp` is a heavy native module (and the project's Node-20 floor exists partly
// for it). It is imported lazily so that merely loading this module graph — which
// `next build` does when tracing route handlers — never touches the native binary;
// only an actual `processImage()` call loads it.
async function loadSharp() {
  return (await import('sharp')).default;
}

/**
 * Server-side image processing (sharp):
 *  - validates real decoded dimensions (rejects too-small / decompression-bomb)
 *  - normalises orientation from EXIF and STRIPS all metadata (EXIF/GPS)
 *  - resizes the longest side down to TARGET_MAX_DIMENSION (never up-scales)
 *  - re-encodes to WebP (uniform, compact output)
 *
 * Re-encoding through sharp also neutralises polyglot/malformed files: only
 * genuinely decodable raster images survive.
 */

export interface ProcessedImage {
  buffer: Buffer;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
}

export class ImageProcessingError extends Error {
  constructor(readonly reason: string) {
    super(`image_processing:${reason}`);
    this.name = 'ImageProcessingError';
  }
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const sharp = await loadSharp();

  let width: number;
  let height: number;
  try {
    const meta = await sharp(input, { failOn: 'error' }).metadata();
    width = meta.width ?? 0;
    height = meta.height ?? 0;
  } catch {
    throw new ImageProcessingError('undecodable');
  }

  if (width === 0 || height === 0) {
    throw new ImageProcessingError('undecodable');
  }
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    throw new ImageProcessingError('too_small');
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageProcessingError('dimensions_too_large');
  }

  // `.rotate()` with no args applies the EXIF orientation then clears it; the
  // default sharp output carries no metadata, so EXIF/GPS is stripped.
  const out = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({
      width: TARGET_MAX_DIMENSION,
      height: TARGET_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    byteSize: out.info.size,
    mimeType: OUTPUT_MIME,
  };
}
