import type { AuthStatus } from './authorization';

/**
 * Authorization failure, carrying the HTTP status the caller should surface.
 * Kept in its own module (no Next.js / Supabase imports) so privileged services
 * can throw/catch it without pulling in request-scoped plumbing.
 */
export class AuthorizationError extends Error {
  readonly status: AuthStatus;
  readonly reason: string;
  constructor(status: AuthStatus, reason: string) {
    super(`authorization_failed:${status}:${reason}`);
    this.name = 'AuthorizationError';
    this.status = status;
    this.reason = reason;
  }
}
