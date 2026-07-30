import 'server-only';

import {
  Prisma,
  type PaymentEvent,
  type PaymentEventType,
  type PaymentStatus,
} from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Provider-event idempotency boundary — the durable mechanism Increment 4C will
 * use to deduplicate repeated provider webhook deliveries. PROVIDER-NEUTRAL: no
 * Stripe/CaSys business logic, no webhook handler; just the replay-safe primitive.
 *
 * Durable dedup key: `payment_events.provider_event_id`, which carries a GLOBAL
 * partial-unique index (`ux_payment_events_provider_event_id`, migration 0002).
 * A provider assigns each event a stable id; recording it is the idempotency
 * gate.
 *
 * Guarantees:
 *   - provider event identity is unique (the DB index),
 *   - a repeated delivery creates NO duplicate payment_event row,
 *   - the optional domain transition (`apply`) runs IN THE SAME TRANSACTION as
 *     the event insert, so a duplicate rolls BOTH back — no duplicate domain
 *     transition and no duplicate subscription event,
 *   - the processing result is safely reusable: a replay returns the already-
 *     stored event with `isReplay: true`.
 */

export interface ProviderEventInput {
  /** The payment attempt this event belongs to. */
  paymentAttemptId: string;
  /** The provider's stable event id — the durable dedup key. */
  providerEventId: string;
  type: PaymentEventType;
  toStatus: PaymentStatus;
  fromStatus?: PaymentStatus | null;
  /** Redacted, non-sensitive snapshot (never signatures / card data / secrets). */
  payloadSummary?: Prisma.InputJsonValue;
}

export interface ProviderEventResult {
  event: PaymentEvent;
  /** True when this delivery was a duplicate of one already processed. */
  isReplay: boolean;
}

/**
 * Record a provider event exactly once, optionally applying a domain transition
 * atomically with it. On the first delivery the event is inserted and `apply`
 * runs in the same transaction. On any repeat delivery of the same
 * `providerEventId`, the unique index rejects the insert, the transaction rolls
 * back (so `apply` has no effect), and the previously-stored event is returned
 * with `isReplay: true`.
 */
export async function recordProviderEventOnce(
  input: ProviderEventInput,
  apply?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<ProviderEventResult> {
  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentEvent.create({
        data: {
          paymentAttemptId: input.paymentAttemptId,
          type: input.type,
          fromStatus: input.fromStatus ?? null,
          toStatus: input.toStatus,
          providerEventId: input.providerEventId,
          ...(input.payloadSummary !== undefined
            ? { payloadSummary: input.payloadSummary }
            : {}),
        },
      });
      if (apply) await apply(tx);
      return created;
    });
    return { event, isReplay: false };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      const existing = await prisma.paymentEvent.findFirst({
        where: { providerEventId: input.providerEventId },
      });
      if (existing) return { event: existing, isReplay: true };
    }
    throw e;
  }
}
