-- CreateTable
CREATE TABLE "coach_photos" (
    "id" TEXT NOT NULL,
    "coach_profile_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "coach_photos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "coach_photos" ADD CONSTRAINT "coach_photos_coach_profile_id_fkey" FOREIGN KEY ("coach_profile_id") REFERENCES "coach_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
