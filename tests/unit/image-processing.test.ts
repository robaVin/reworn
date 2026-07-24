import { describe, it, expect } from 'vitest';

/**
 * Real image-processing behaviour, exercised through actual `sharp`.
 *
 * `sharp` is a native module requiring the project's Node-20 floor. When it
 * cannot load (e.g. a local Node-18 shell), the whole suite is SKIPPED rather
 * than failed — the project's verification gate runs on Node 20, where these
 * assertions execute in full. This mirrors the existing webcrypto note in
 * tests/setup.ts.
 */

let sharpAvailable = true;
let sharp!: typeof import('sharp').default;
try {
  sharp = (await import('sharp')).default;
} catch {
  sharpAvailable = false;
}

const { processImage, ImageProcessingError } =
  await import('@/modules/catalog/image-processing');

async function solidJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe.skipIf(!sharpAvailable)('processImage (real sharp)', () => {
  it('re-encodes a valid image to WebP within the target bound', async () => {
    const out = await processImage(await solidJpeg(3000, 2000));
    expect(out.mimeType).toBe('image/webp');
    expect(Math.max(out.width, out.height)).toBe(1600); // resized down
    expect(out.byteSize).toBeGreaterThan(0);
    // The output really is a WebP.
    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe('webp');
  });

  it('never upscales a small-but-valid image', async () => {
    const out = await processImage(await solidJpeg(800, 600));
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);
  });

  it('normalises EXIF orientation and strips metadata', async () => {
    // orientation 6 = rotate 90°; a 1200×800 source becomes 800×1200 upright.
    const oriented = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const out = await processImage(oriented);
    expect(out.width).toBe(800);
    expect(out.height).toBe(1200);

    const meta = await sharp(out.buffer).metadata();
    // Orientation baked into pixels and cleared; no EXIF carried through.
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
    expect(meta.exif).toBeUndefined();
  });

  it('rejects an image below the minimum dimension', async () => {
    await expect(processImage(await solidJpeg(100, 100))).rejects.toThrow(
      ImageProcessingError,
    );
  });

  it('rejects an image beyond the maximum source dimension', async () => {
    await expect(processImage(await solidJpeg(8100, 500))).rejects.toThrow(
      ImageProcessingError,
    );
  });

  it('rejects an undecodable buffer', async () => {
    await expect(
      processImage(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])),
    ).rejects.toThrow(ImageProcessingError);
  });
});
