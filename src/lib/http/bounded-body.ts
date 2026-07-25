/**
 * Reads a request body stream into a Buffer while enforcing a hard byte ceiling
 * DURING the read. This bounds peak memory to (limit + one chunk): the moment
 * cumulative bytes exceed `maxBytes` the stream is cancelled and the read aborts,
 * so an attacker cannot force an arbitrarily large allocation by streaming a huge
 * (or chunked, content-length-less) body.
 *
 * Pure and dependency-free so it can be unit-tested with a synthetic stream.
 */

export class PayloadTooLargeError extends Error {
  readonly status = 413 as const;
  constructor(readonly maxBytes: number) {
    super(`payload_too_large:${maxBytes}`);
    this.name = 'PayloadTooLargeError';
  }
}

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling more data and free the upstream immediately.
        await reader.cancel();
        throw new PayloadTooLargeError(maxBytes);
      }
      chunks.push(
        Buffer.from(value.buffer, value.byteOffset, value.byteLength),
      );
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}
