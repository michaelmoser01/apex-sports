-- Step 1: Add new athlete_profile_id column to bookings (idempotent)
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "athlete_profile_id" TEXT;

-- Step 2: Backfill bookings from existing athlete_id (User.id) -> AthleteProfile.id
UPDATE "bookings" SET "athlete_profile_id" = (
  SELECT "id" FROM "athlete_profiles" WHERE "athlete_profiles"."user_id" = "bookings"."athlete_id"
) WHERE "athlete_profile_id" IS NULL AND "athlete_id" IS NOT NULL;

-- Step 3: Create athlete profiles for any users that have bookings but no athlete profile yet
INSERT INTO "athlete_profiles" ("id", "user_id", "display_name", "sports", "created_at")
SELECT gen_random_uuid()::text, u."id", COALESCE(u."name", ''), ARRAY[]::text[], NOW()
FROM "User" u
WHERE u."id" IN (SELECT DISTINCT "athlete_id" FROM "bookings" WHERE "athlete_profile_id" IS NULL)
AND NOT EXISTS (SELECT 1 FROM "athlete_profiles" ap WHERE ap."user_id" = u."id");

-- Step 4: Backfill any remaining NULL athlete_profile_id values after profile creation
UPDATE "bookings" SET "athlete_profile_id" = (
  SELECT "id" FROM "athlete_profiles" WHERE "athlete_profiles"."user_id" = "bookings"."athlete_id"
) WHERE "athlete_profile_id" IS NULL AND "athlete_id" IS NOT NULL;

-- Step 5: Make athlete_profile_id NOT NULL (only if all rows have values)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "bookings" WHERE "athlete_profile_id" IS NULL) THEN
    ALTER TABLE "bookings" ALTER COLUMN "athlete_profile_id" SET NOT NULL;
  END IF;
END $$;

-- Step 6: Drop old athlete_id column from bookings (idempotent)
ALTER TABLE "bookings" DROP COLUMN IF EXISTS "athlete_id";

-- Step 7: Add FK constraint on bookings.athlete_profile_id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_athlete_profile_id_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_athlete_profile_id_fkey" FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 8: Add new athlete_profile_id column to reviews (idempotent)
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "athlete_profile_id" TEXT;

-- Step 9: Backfill reviews
UPDATE "reviews" SET "athlete_profile_id" = (
  SELECT "id" FROM "athlete_profiles" WHERE "athlete_profiles"."user_id" = "reviews"."athlete_id"
) WHERE "athlete_profile_id" IS NULL AND "athlete_id" IS NOT NULL;

-- Step 10: Create athlete profiles for review authors without one (edge case)
INSERT INTO "athlete_profiles" ("id", "user_id", "display_name", "sports", "created_at")
SELECT gen_random_uuid()::text, u."id", COALESCE(u."name", ''), ARRAY[]::text[], NOW()
FROM "User" u
WHERE u."id" IN (SELECT DISTINCT "athlete_id" FROM "reviews" WHERE "athlete_profile_id" IS NULL)
AND NOT EXISTS (SELECT 1 FROM "athlete_profiles" ap WHERE ap."user_id" = u."id");

-- Step 11: Backfill remaining NULL review athlete_profile_id values
UPDATE "reviews" SET "athlete_profile_id" = (
  SELECT "id" FROM "athlete_profiles" WHERE "athlete_profiles"."user_id" = "reviews"."athlete_id"
) WHERE "athlete_profile_id" IS NULL AND "athlete_id" IS NOT NULL;

-- Step 12: Make athlete_profile_id NOT NULL on reviews (only if all rows have values)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "reviews" WHERE "athlete_profile_id" IS NULL) THEN
    ALTER TABLE "reviews" ALTER COLUMN "athlete_profile_id" SET NOT NULL;
  END IF;
END $$;

-- Step 13: Drop old athlete_id column from reviews (idempotent)
ALTER TABLE "reviews" DROP COLUMN IF EXISTS "athlete_id";

-- Step 14: Add FK constraint on reviews.athlete_profile_id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reviews_athlete_profile_id_fkey') THEN
    ALTER TABLE "reviews" ADD CONSTRAINT "reviews_athlete_profile_id_fkey" FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Step 15: Remove UNIQUE constraint on athlete_profiles.user_id (allow multiple profiles per user)
ALTER TABLE "athlete_profiles" DROP CONSTRAINT IF EXISTS "athlete_profiles_user_id_key";
