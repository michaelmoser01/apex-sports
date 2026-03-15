-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "billing_mode" TEXT NOT NULL DEFAULT 'after_session';
