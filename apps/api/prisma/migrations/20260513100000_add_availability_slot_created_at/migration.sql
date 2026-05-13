-- Add created_at to availability_slots so we can chart when slots were actually added.
--
-- We deliberately avoid `NOT NULL DEFAULT CURRENT_TIMESTAMP` in one step, because
-- that would backfill every existing slot with the migration timestamp (lesson
-- learned from 20260512000000 on availability_rules).
--
-- Strategy:
--   1. Add the column nullable.
--   2. Backfill with LEAST(start_time, NOW()) so:
--        - past slots get approximately when they were valid (close enough for charting)
--        - future slots get NOW() so we never claim they were added in the future
--   3. Lock NOT NULL + DEFAULT CURRENT_TIMESTAMP so new inserts work.

ALTER TABLE "availability_slots" ADD COLUMN "created_at" TIMESTAMP(3);

UPDATE "availability_slots"
SET "created_at" = LEAST("start_time", NOW())
WHERE "created_at" IS NULL;

ALTER TABLE "availability_slots" ALTER COLUMN "created_at" SET NOT NULL;
ALTER TABLE "availability_slots" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
