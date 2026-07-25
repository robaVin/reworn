import 'server-only';

import { logger } from './logger';

/**
 * Lightweight server-side timing spans for latency investigation.
 *
 * OFF by default: spans are recorded only when `PERF_TRACE=1`, so there is zero
 * overhead and zero log noise in normal dev/production. It logs ONLY a span
 * name and a millisecond duration (plus an optional non-sensitive count) — never
 * user ids, emails, tokens, signed URLs, or listing contents.
 *
 * This is deliberately not a monitoring platform: it is a temporary,
 * dependency-free probe for one performance pass.
 */

const ENABLED = process.env.PERF_TRACE === '1';

export function perfEnabled(): boolean {
  return ENABLED;
}

/** Times an async span and logs `{ span, ms }` when tracing is enabled. */
export async function timeSpan<T>(
  name: string,
  fn: () => Promise<T>,
  meta?: { count?: number },
): Promise<T> {
  if (!ENABLED) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    logger.info('perf', {
      span: name,
      ms: Math.round(performance.now() - start),
      ...(meta?.count !== undefined ? { count: meta.count } : {}),
    });
  }
}
