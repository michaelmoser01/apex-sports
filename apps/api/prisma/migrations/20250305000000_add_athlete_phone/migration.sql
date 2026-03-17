-- Add phone column to athlete_profiles for athlete contact info
ALTER TABLE "athlete_profiles"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

