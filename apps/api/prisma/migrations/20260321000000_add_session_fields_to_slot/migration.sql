-- Add session-level fields to availability_slots (slot = session anchor)
ALTER TABLE "availability_slots" ADD COLUMN "session_status" TEXT NOT NULL DEFAULT 'available';
ALTER TABLE "availability_slots" ADD COLUMN "slot_invite_code" TEXT;
ALTER TABLE "availability_slots" ADD COLUMN "slot_locked_private" BOOLEAN NOT NULL DEFAULT FALSE;

-- Unique index on invite code
CREATE UNIQUE INDEX "availability_slots_slot_invite_code_key" ON "availability_slots"("slot_invite_code");
