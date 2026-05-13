-- Second corrective backfill for availability_rules.created_at.
--
-- The previous backfill (20260512100000) set created_at to MIN(slot.start_time)
-- as a proxy. For coaches whose earliest slot is in the future, this produced
-- created_at values in the future — which then fall outside the admin chart's
-- "last 90 days" rendered window and make the chart look empty.
--
-- A rule cannot have been created in the future. Cap any future-dated
-- created_at to "now" so the timeline is at least monotonic.
--
-- This is a one-shot fix. New rules going forward use CURRENT_TIMESTAMP and
-- will never be future-dated. Safely idempotent: re-running on a clean DB
-- is a no-op (no row has created_at > now under normal operation).

UPDATE "availability_rules"
SET "created_at" = CURRENT_TIMESTAMP
WHERE "created_at" > CURRENT_TIMESTAMP;
