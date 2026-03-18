-- CreateTable
CREATE TABLE "favorite_coaches" (
    "id" TEXT NOT NULL,
    "athlete_profile_id" TEXT NOT NULL,
    "coach_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_coaches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "favorite_coaches_athlete_profile_id_coach_profile_id_key" ON "favorite_coaches"("athlete_profile_id", "coach_profile_id");

-- AddForeignKey
ALTER TABLE "favorite_coaches" ADD CONSTRAINT "favorite_coaches_athlete_profile_id_fkey" FOREIGN KEY ("athlete_profile_id") REFERENCES "athlete_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_coaches" ADD CONSTRAINT "favorite_coaches_coach_profile_id_fkey" FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
