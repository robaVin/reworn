import 'server-only';

import { NextResponse } from 'next/server';
import { AuthorizationError } from './guards';
import { logger } from '@/lib/logger';

/**
 * Maps authorization failures to HTTP responses for ROUTE HANDLERS.
 *
 * Bodies are deliberately generic — they never reveal why a check failed or
 * whether a resource exists — while the precise reason is logged server-side
 * (redacted) for debugging. Status codes follow the agreed contract:
 *   401 unauthenticated · 403 authenticated-but-forbidden · 404 hide-existence.
 */
const GENERIC: Record<number, string> = {
  401: 'Authentication required.',
  403: 'You do not have permission to perform this action.',
  404: 'Not found.',
};

export function authErrorToResponse(error: AuthorizationError): NextResponse {
  logger.warn('authorization denied', {
    status: error.status,
    reason: error.reason,
  });
  return NextResponse.json(
    { error: GENERIC[error.status] ?? 'Request failed.' },
    { status: error.status },
  );
}

/**
 * Wraps a route handler so any AuthorizationError thrown by a guard becomes the
 * correct response instead of a 500. Non-auth errors are re-thrown for the
 * platform's error handling (and are never leaked to the client here).
 */
export function protectedRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return authErrorToResponse(error);
      }
      throw error;
    }
  };
}
