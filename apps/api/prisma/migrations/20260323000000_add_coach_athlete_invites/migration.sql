-- CreateTable
CREATE TABLE IF NOT EXISTS "coach_athlete_invites" (
    "id" TEXT NOT NULL,
    "coach_profile_id" TEXT NOT NULL,
    "athlete_email" TEXT NOT NULL,
    "athlete_name" TEXT NOT NULL,
    "parent_name" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoted_at" TIMESTAMP(3),
    "promoted_to_coach_athlete_id" TEXT,

    CONSTRAINT "coach_athlete_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coach_athlete_invites_token_key" ON "coach_athlete_invites"("token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coach_athlete_invites_coach_profile_id_athlete_email_key" ON "coach_athlete_invites"("coach_profile_id", "athlete_email");

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "coach_athlete_invites" ADD CONSTRAINT "coach_athlete_invites_coach_profile_id_fkey" FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
