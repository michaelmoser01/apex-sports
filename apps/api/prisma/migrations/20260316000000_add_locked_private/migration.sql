-- Add lockedPrivate to bookings for flexible session model
ALTER TABLE "bookings" ADD COLUMN "locked_private" BOOLEAN NOT NULL DEFAULT FALSE;
