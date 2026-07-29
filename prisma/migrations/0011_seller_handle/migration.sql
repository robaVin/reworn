-- Public seller handle: a lowercase, URL-safe slug for /shop/[handle].
-- Carries no authorization and never encodes a UUID. Handles are immutable once
-- assigned (no UPDATE path exists); changing this policy later requires a
-- redirect-history table so existing public URLs never silently break.

ALTER TABLE "seller_profiles" ADD COLUMN "handle" text;

-- Deterministic, collision-safe, reserved-protected backfill for existing rows.
-- Ordered by (created_at, id) so the assignment is reproducible.
DO $$
DECLARE
  r RECORD;
  base TEXT;
  cand TEXT;
  n INT;
  reserved TEXT[] := ARRAY[
    'admin','api','browse','listing','listings','login','logout','messages',
    'seller','sell','shop','signup','signin','support','account','settings',
    'about','help','new','edit'
  ];
BEGIN
  FOR r IN
    SELECT id, shop_name FROM "seller_profiles"
    WHERE handle IS NULL
    ORDER BY created_at ASC, id ASC
  LOOP
    base := btrim(
      regexp_replace(lower(coalesce(r.shop_name, '')), '[^a-z0-9]+', '-', 'g'),
      '-'
    );
    base := regexp_replace(base, '-+', '-', 'g');
    IF length(base) < 3 THEN
      base := CASE WHEN base = '' THEN 'seller' ELSE base || '-shop' END;
    END IF;
    IF length(base) > 30 THEN
      base := btrim(left(base, 30), '-');
    END IF;
    IF base = ANY(reserved) THEN
      base := base || '-shop';
    END IF;

    cand := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM "seller_profiles" WHERE handle = cand) LOOP
      n := n + 1;
      cand := left(base, 30 - (length(n::text) + 1)) || '-' || n::text;
    END LOOP;

    UPDATE "seller_profiles" SET handle = cand WHERE id = r.id;
  END LOOP;
END $$;

-- Enforce shape + reserved names at the database layer (mirrors app validation).
ALTER TABLE "seller_profiles" ALTER COLUMN "handle" SET NOT NULL;

ALTER TABLE "seller_profiles"
  ADD CONSTRAINT "seller_profiles_handle_format_chk"
  CHECK (handle ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' AND handle NOT LIKE '%--%');

ALTER TABLE "seller_profiles"
  ADD CONSTRAINT "seller_profiles_handle_reserved_chk"
  CHECK (handle <> ALL (ARRAY[
    'admin','api','browse','listing','listings','login','logout','messages',
    'seller','sell','shop','signup','signin','support','account','settings',
    'about','help','new','edit'
  ]));

-- Handles are stored already-lowercased, so a plain unique index is
-- case-insensitive in practice.
CREATE UNIQUE INDEX "seller_profiles_handle_key" ON "seller_profiles" ("handle");
