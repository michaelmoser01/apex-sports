-- Backfill session_status on availability_slots from existing booking data
-- Run after the schema migration has been applied.

-- 1. Set session_status = 'completed' for slots with any completed booking
UPDATE availability_slots
SET session_status = 'completed'
WHERE id IN (
  SELECT DISTINCT slot_id FROM bookings WHERE status = 'completed'
);

-- 2. Set session_status = 'confirmed' for slots with confirmed bookings (not already completed)
UPDATE availability_slots
SET session_status = 'confirmed'
WHERE session_status = 'available'
AND id IN (
  SELECT DISTINCT slot_id FROM bookings WHERE status = 'confirmed'
);

-- 3. Set session_status = 'pending' for slots with only pending bookings (not already confirmed/completed)
UPDATE availability_slots
SET session_status = 'pending'
WHERE session_status = 'available'
AND id IN (
  SELECT DISTINCT slot_id FROM bookings WHERE status = 'pending'
)
AND id NOT IN (
  SELECT DISTINCT slot_id FROM bookings WHERE status IN ('confirmed', 'completed')
);

-- 4. Copy invite_code from the first booking that has one to the slot
UPDATE availability_slots AS s
SET slot_invite_code = sub.invite_code
FROM (
  SELECT DISTINCT ON (slot_id) slot_id, invite_code
  FROM bookings
  WHERE invite_code IS NOT NULL
  ORDER BY slot_id, created_at ASC
) AS sub
WHERE s.id = sub.slot_id
AND s.slot_invite_code IS NULL;

-- 5. Copy locked_private from any booking that has it set to true
UPDATE availability_slots
SET slot_locked_private = TRUE
WHERE id IN (
  SELECT DISTINCT slot_id FROM bookings WHERE locked_private = TRUE AND status != 'cancelled'
);
