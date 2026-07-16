/**
 * Rate limiting foundation.
 *
 * ============================ HONEST LIMITATION ============================
 * This is an IN-MEMORY, PER-INSTANCE limiter. On a serverless platform
 * (Vercel) each function instance keeps its own counters, so the effective
 * global limit is `limit x instances`. It raises the cost of brute-force and
 * scripted abuse; it is NOT a hard distributed guarantee.
 *
 * This is a deliberate Stage 1 choice: the approved constraint is to avoid
 * introducing Redis or extra infrastructure without a documented need. The
 * `RateLimitStore` seam below exists so a distributed store (Upstash/Redis)
 * can be dropped in without touching call sites, once we have a documented
 * need — i.e. real abuse traffic or a security review finding.
 *
 * Documented in docs/04-security-architecture.md.
 * ==========================================================================
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Unix ms at which the window resets. */
  resetAt: number;
}

export interface RateLimitStore {
  check(key: string, limit: number, windowMs: number): RateLimitResult;
}

/** Sliding-window log. Accurate at the edges, unlike a fixed window. */
export class InMemoryRateLimitStore implements RateLimitStore {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    this.sweep(now, windowMs);

    const timestamps = (this.hits.get(key) ?? []).filter(
      (t) => t > windowStart,
    );

    if (timestamps.length >= limit) {
      const oldest = timestamps[0] ?? now;
      this.hits.set(key, timestamps);
      return { allowed: false, remaining: 0, resetAt: oldest + windowMs };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    return {
      allowed: true,
      remaining: Math.max(limit - timestamps.length, 0),
      resetAt: now + windowMs,
    };
  }

  /** Prevents unbounded memory growth from one-off keys. */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, timestamps] of this.hits.entries()) {
      const live = timestamps.filter((t) => t > now - windowMs);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }

  /** Test helper. */
  reset(): void {
    this.hits.clear();
    this.lastSweep = 0;
  }
}

export const rateLimitStore = new InMemoryRateLimitStore();

/**
 * Builds a limiter key. Prefer a stable identity (user id) over IP where
 * available, because IPs are shared behind NAT and trivially rotated.
 */
export function rateLimitKey(scope: string, identity: string): string {
  return `${scope}:${identity}`;
}

/**
 * Best-effort client identity for unauthenticated requests.
 *
 * Note: these headers are attacker-controlled unless the platform overwrites
 * them. Vercel sets `x-forwarded-for` from the real connection, so it is
 * trustworthy there; the left-most entry is used.
 */
export function clientIdentity(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') ?? 'unknown';
}

export function checkRateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  store: RateLimitStore = rateLimitStore,
): RateLimitResult {
  return store.check(
    rateLimitKey(scope, identity),
    limit,
    windowSeconds * 1000,
  );
}
