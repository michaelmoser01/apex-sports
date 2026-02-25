import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_COACH_ID = "11111111-1111-1111-1111-111111111111";
const DEMO_ATHLETE_ID = "22222222-2222-2222-2222-222222222222";

async function main() {
  const coach = await prisma.user.upsert({
    where: { email: "coach@test.com" },
    create: {
      id: DEMO_COACH_ID,
      email: "coach@test.com",
      name: "Demo Coach",
      cognitoSub: null,
    },
    update: {},
  });

  await prisma.coachProfile.upsert({
    where: { userId: coach.id },
    create: {
      userId: coach.id,
      displayName: "Demo Coach",
      sports: ["Tennis"],
      serviceCities: ["Oakland, CA"],
      bio: "Experienced tennis coach with 10+ years of teaching. USPTA certified.",
      hourlyRate: 75,
    },
    update: {},
  });

  await prisma.user.upsert({
    where: { email: "athlete@test.com" },
    create: {
      id: DEMO_ATHLETE_ID,
      email: "athlete@test.com",
      name: "Demo Athlete",
      cognitoSub: null,
    },
    update: {},
  });

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: coach.id },
  });

  if (coachProfile) {
    const existingSlots = await prisma.availabilitySlot.count({
      where: { coachId: coachProfile.id },
    });
    if (existingSlots === 0) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const endTomorrow = new Date(tomorrow);
      endTomorrow.setHours(11, 0, 0, 0);
      await prisma.availabilitySlot.create({
        data: {
          coachId: coachProfile.id,
          startTime: tomorrow,
          endTime: endTomorrow,
        },
      });
    }
  }

  console.log("Seed complete: Demo Coach (coach@test.com) and Demo Athlete (athlete@test.com)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
