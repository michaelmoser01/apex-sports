-- Add assistant and plan fields for coach onboarding
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "assistant_display_name" TEXT;
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "assistant_phone_number" TEXT;
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "plan_id" TEXT;
