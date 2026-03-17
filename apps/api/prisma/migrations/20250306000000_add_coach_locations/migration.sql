-- CreateTable
CREATE TABLE IF NOT EXISTS "coach_locations" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(9,7),

    CONSTRAINT "coach_locations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "availability_rules" ADD COLUMN IF NOT EXISTS "location_id" TEXT;
ALTER TABLE "availability_slots" ADD COLUMN IF NOT EXISTS "location_id" TEXT;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "coach_locations" ADD CONSTRAINT "coach_locations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "coach_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "coach_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
