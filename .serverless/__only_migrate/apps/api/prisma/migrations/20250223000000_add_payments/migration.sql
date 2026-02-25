-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_customer_id" TEXT;

-- AlterTable
ALTER TABLE "coach_profiles" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" TEXT,
ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "amount_cents" INTEGER,
ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'usd',
ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" TEXT,
ADD COLUMN IF NOT EXISTS "payment_status" TEXT;

-- CreateIndex (only if column was just added; unique constraint)
CREATE UNIQUE INDEX IF NOT EXISTS "User_stripe_customer_id_key" ON "User"("stripe_customer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "coach_profiles_stripe_connect_account_id_key" ON "coach_profiles"("stripe_connect_account_id");
