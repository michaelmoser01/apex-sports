-- Add assistant capabilities (JSON) for coach onboarding
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "assistant_capabilities" JSONB;
