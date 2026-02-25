-- CreateTable
CREATE TABLE "availability_rules" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "first_start_time" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'weekly',
    "end_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "availability_slots" ADD COLUMN "rule_id" TEXT;

-- AddForeignKey
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "availability_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
