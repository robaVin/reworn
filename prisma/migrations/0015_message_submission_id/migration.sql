-- =============================================================================
-- 0015 -- Message idempotency token (Increment 3B-D)
-- =============================================================================
-- Forward-only. Adds an OPTIONAL client-generated submission token to messages
-- and a sender-scoped unique index so a retried/replayed compose of the same
-- intended message converges on ONE row instead of duplicating.
--
--   * `client_submission_id` is nullable: it is ONLY an idempotency key. It never
--     determines sender identity or authorization -- the sender is always derived
--     from the authenticated context by the service. Rows inserted by any
--     non-composer path leave it NULL.
--   * The unique index is scoped by (conversation_id, sender_profile_id,
--     client_submission_id). Because SQL treats NULLs as distinct, untokenised
--     inserts are unaffected; only a repeated NON-NULL token from the SAME sender
--     collides. Including sender_profile_id means the two participants may reuse
--     the same token value without a false collision.
--   * The activity-bump trigger fires on INSERT, so a duplicate that is rejected
--     by this index does NOT double-bump conversation activity.
--
-- ASCII-only by policy (files are read as WIN1252 by the Windows toolchain).
-- =============================================================================

-- AlterTable
ALTER TABLE "messages" ADD COLUMN "client_submission_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "messages_submission_key"
  ON "messages" ("conversation_id", "sender_profile_id", "client_submission_id");
