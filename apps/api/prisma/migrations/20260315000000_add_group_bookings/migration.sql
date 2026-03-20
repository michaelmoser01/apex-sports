-- Add maxCapacity to availability_slots and availability_rules
ALTER TABLE "availability_slots" ADD COLUMN "max_capacity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "availability_rules" ADD COLUMN "max_capacity" INTEGER NOT NULL DEFAULT 1;

-- Add groupRates to coach_profiles
ALTER TABLE "coach_profiles" ADD COLUMN "group_rates" JSONB;

-- Add group booking fields to bookings
ALTER TABLE "bookings" ADD COLUMN "group_size" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "bookings" ADD COLUMN "invite_code" TEXT;
ALTER TABLE "bookings" ADD COLUMN "is_group_organizer" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "bookings" ADD COLUMN "group_booking_id" TEXT;
ALTER TABLE "bookings" ADD COLUMN "attended" BOOLEAN NOT NULL DEFAULT TRUE;

-- Unique index on invite_code
CREATE UNIQUE INDEX "bookings_invite_code_key" ON "bookings"("invite_code");

-- Foreign key for group_booking_id self-reference
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_group_booking_id_fkey"
  FOREIGN KEY ("group_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
