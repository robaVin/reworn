-- Auto-draft idempotency: a per-form-session key so concurrent "first actions"
-- converge on ONE draft instead of creating duplicate empty listings.
--
-- Nullable + UNIQUE: PostgreSQL permits many NULLs under a UNIQUE constraint, so
-- rows not created via the bootstrap path are unaffected; only real keys collide.
-- The unique index is the authoritative race guard — the application relies on
-- catching its violation, not on a client button being disabled.

ALTER TABLE "listings" ADD COLUMN "bootstrap_key" uuid;

CREATE UNIQUE INDEX "listings_bootstrap_key_key"
  ON "listings" ("bootstrap_key");
