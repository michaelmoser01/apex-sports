-- CreateTable
CREATE TABLE "coach_invites" (
    "id" TEXT NOT NULL,
    "coach_profile_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_athletes" (
    "id" TEXT NOT NULL,
    "coach_profile_id" TEXT NOT NULL,
    "athlete_profile_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_athlete_phone_opt_ins" (
    "id" TEXT NOT NULL,
    "coach_profile_id" TEXT NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "opted_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'sms_inbound',

    CONSTRAINT "coach_athlete_phone_opt_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coach_invites_coach_profile_id_key" ON "coach_invites"("coach_profile_id");
CREATE UNIQUE INDEX "coach_invites_slug_key" ON "coach_invites"("slug");
CREATE UNIQUE INDEX "coach_athletes_coach_profile_id_athlete_profile_id_key" ON "coach_athletes"("coach_profile_id", "athlete_profile_id");
CREATE UNIQUE INDEX "coach_athlete_phone_opt_ins_coach_profile_id_phone_e164_key" ON "coach_athlete_phone_opt_ins"("coach_profile_id", "phone_e164");

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_coach_profile_id_fkey" FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_coach_profile_id_fkey" FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_athletes" ADD CONSTRAINT "coach_athletes_athlete_profile_id_fkey" FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coach_athlete_phone_opt_ins" ADD CONSTRAINT "coach_athlete_phone_opt_ins_coach_profile_id_fkey" FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
