import 'server-only';

import { AuthorizationError } from '@/modules/auth/errors';
import { InvalidListingTransitionError } from './listing-status';
import {
  ImageLimitError,
  ImageRejectedError,
  ListingConflictError,
  ListingIncompleteError,
} from './errors';
import { logger } from '@/lib/logger';
import { RateLimitedError } from '@/lib/security/rate-limit';

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
  if (error instanceof ListingIncompleteError) {
    return actionFail(error.status, 'listing_incomplete', error.fieldErrors);
  }
  if (error instanceof ImageRejectedError) {
    return actionFail(error.status, error.message);
  }
  if (error instanceof ImageLimitError) {
    return actionFail(error.status, error.message);
  }
  if (error instanceof RateLimitedError) {
    return actionFail(error.status, 'rate_limited');
  }
  logger.error('listing action failed', { error });
  return actionFail(500, 'server_error');
}
