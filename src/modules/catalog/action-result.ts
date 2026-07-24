import 'server-only';

import { AuthorizationError } from '@/modules/auth/errors';
import { InvalidListingTransitionError } from './listing-status';
import { ListingConflictError } from './errors';
import { logger } from '@/lib/logger';

/**
 * Serializable result shape for listing server actions. Kept in its own module
 * (not the `'use server'` file, which may only export async functions).
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      status: number;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFail(
  status: number,
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, status, error, fieldErrors };
}

/** Maps thrown errors to a safe, serializable failure (never leaks internals). */
export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof AuthorizationError) {
    return actionFail(error.status, error.reason);
  }
  if (error instanceof InvalidListingTransitionError) {
    return actionFail(409, error.message);
  }
  if (error instanceof ListingConflictError) {
    return actionFail(error.status, error.reason);
  }
  logger.error('listing action failed', { error });
  return actionFail(500, 'server_error');
}
