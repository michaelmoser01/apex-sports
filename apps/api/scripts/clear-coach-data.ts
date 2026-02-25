/**
 * Clear coach (and optionally user) data from the database.
 *
 * DESTRUCTIVE: Only run against the database you intend to reset (local vs deployed).
 * Ensure DATABASE_URL is set correctly before running.
 *
 * Usage:
 *   From repo root: pnpm exec tsx apps/api/scripts/clear-coach-data.ts [userId]
 *   From apps/api:  npx tsx scripts/clear-coach-data.ts [userId]
 *
 * - With no args: deletes all coach-related data (reviews, bookings, coach_photos,
 *   availability_slots, coach_profiles). Does NOT delete users.
 * - With userId: deletes that user's coach profile and all related data only.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userId = process.argv[2] ?? null;

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Set it to the database you intend to reset.");
    process.exit(1);
  }

  if (userId) {
    const profile = await prisma.coachProfile.findUnique({ where: { userId } });
    if (!profile) {
      console.log(`No coach profile found for user ${userId}. Nothing to delete.`);
      return;
    }
    const coachId = profile.id;

    const deletedReviews = await prisma.review.deleteMany({ where: { coachId } });
    const deletedBookings = await prisma.booking.deleteMany({ where: { coachId } });
    const deletedPhotos = await prisma.coachPhoto.deleteMany({ where: { coachProfileId: coachId } });
    const deletedSlots = await prisma.availabilitySlot.deleteMany({ where: { coachId } });
    await prisma.coachProfile.delete({ where: { id: coachId } });

    console.log(`Cleared coach data for user ${userId}:`);
    console.log(`  Reviews: ${deletedReviews.count}, Bookings: ${deletedBookings.count}, Photos: ${deletedPhotos.count}, Slots: ${deletedSlots.count}, Coach profile: 1`);
    return;
  }

  const deletedReviews = await prisma.review.deleteMany();
  const deletedBookings = await prisma.booking.deleteMany();
  const deletedPhotos = await prisma.coachPhoto.deleteMany();
  const deletedSlots = await prisma.availabilitySlot.deleteMany();
  const deletedProfiles = await prisma.coachProfile.deleteMany();

  console.log("Cleared all coach-related data:");
  console.log(`  Reviews: ${deletedReviews.count}, Bookings: ${deletedBookings.count}, Coach photos: ${deletedPhotos.count}, Availability slots: ${deletedSlots.count}, Coach profiles: ${deletedProfiles.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
