import { describe, it, expect } from 'vitest';
import { readBoundedBody, PayloadTooLargeError } from '@/lib/http/bounded-body';

/**
 * Streaming request-size enforcement. Proves the cap is applied WHILE reading
 * (not after buffering), including for content-length-less / chunked streams —
 * the memory-exhaustion protection for the image upload route.
 */

function streamFrom(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]!);
      else controller.close();
    },
  });
}

const chunk = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

describe('readBoundedBody', () => {
  it('reads a body within the limit', async () => {
    const buf = await readBoundedBody(
      streamFrom([chunk(100), chunk(100)]),
      1000,
    );
    expect(buf.byteLength).toBe(200);
  });

  it('returns empty for a null body', async () => {
    expect((await readBoundedBody(null, 1000)).byteLength).toBe(0);
  });

  it('rejects once cumulative bytes exceed the limit', async () => {
    await expect(
      readBoundedBody(streamFrom([chunk(600), chunk(600)]), 1000),
    ).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it('aborts mid-stream without draining the remainder (bounded memory)', async () => {
    let produced = 0;
    // An effectively endless stream: if the cap were not enforced during the
    // read, this would never terminate / would allocate without bound.
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced += 1;
        controller.enqueue(chunk(500));
      },
    });
    await expect(readBoundedBody(endless, 1000)).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    );
    // Only a handful of chunks were pulled before the abort — not unbounded.
    expect(produced).toBeLessThan(10);
  });

  it('accepts a body exactly at the limit', async () => {
    const buf = await readBoundedBody(streamFrom([chunk(1000)]), 1000);
    expect(buf.byteLength).toBe(1000);
  });
});
