-- AlterTable: add avatar_url to athlete_profiles
DO $$ BEGIN
  ALTER TABLE "athlete_profiles" ADD COLUMN "avatar_url" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
