-- =============================================================================
-- 0003 — Referential integrity: subscription_events.payment_attempt_id
-- =============================================================================
-- Pre-auth review finding: `subscription_events.payment_attempt_id` referenced a
-- payment attempt without a foreign key, allowing orphaned/invalid references.
--
-- Forward-only migration (0001/0002 are already applied and are NOT edited).
--
-- Existing-data safety: the column is nullable and the FK is ON DELETE SET NULL,
-- so this is safe on a populated table PROVIDED every existing non-null value
-- references a real payment_attempts row. The repository is greenfield (no rows
-- yet), so the constraint is added and validated immediately. On a populated
-- database one would instead add it `NOT VALID` and `VALIDATE CONSTRAINT` in a
-- second step to avoid a long lock — noted here for the record.
-- =============================================================================

-- Index first (supports the FK's referential-action check and event lookups by
-- attempt). IF NOT EXISTS keeps the migration safe to re-run.
CREATE INDEX IF NOT EXISTS "subscription_events_payment_attempt_id_idx"
  ON "subscription_events" ("payment_attempt_id");

-- Foreign key. Guarded so re-running does not error if it already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'subscription_events_payment_attempt_id_fkey'
  ) THEN
    ALTER TABLE "subscription_events"
      ADD CONSTRAINT "subscription_events_payment_attempt_id_fkey"
      FOREIGN KEY ("payment_attempt_id")
      REFERENCES "payment_attempts" ("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
