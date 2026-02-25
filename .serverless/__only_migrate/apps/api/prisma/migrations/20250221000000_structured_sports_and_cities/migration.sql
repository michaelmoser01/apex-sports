-- Add new array columns
ALTER TABLE "coach_profiles" ADD COLUMN "sports" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
ALTER TABLE "coach_profiles" ADD COLUMN "service_cities" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;

-- Backfill from existing sport and location
UPDATE "coach_profiles" SET "sports" = ARRAY["sport"] WHERE "sport" IS NOT NULL AND TRIM("sport") != '';
UPDATE "coach_profiles" SET "service_cities" = ARRAY["location"] WHERE "location" IS NOT NULL AND TRIM("location") != '';

-- Drop old columns
ALTER TABLE "coach_profiles" DROP COLUMN "sport";
ALTER TABLE "coach_profiles" DROP COLUMN "location";
