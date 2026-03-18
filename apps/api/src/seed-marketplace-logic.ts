/**
 * Shared marketplace seed logic. Used by the CLI script (scripts/seed-marketplace.ts)
 * and by the Lambda seed-handler (runs in VPC against Aurora).
 */
import type { PrismaClient } from "@prisma/client";
import { ALLOWED_SPORTS } from "@apex-sports/shared";

const SEED_CITIES = [
  { label: "San Francisco, CA", lat: 37.7749, lng: -122.4194 },
  { label: "Oakland, CA", lat: 37.8044, lng: -122.2712 },
  { label: "Berkeley, CA", lat: 37.8716, lng: -122.2727 },
  { label: "San Jose, CA", lat: 37.3382, lng: -121.8863 },
  { label: "Palo Alto, CA", lat: 37.4419, lng: -122.1430 },
  { label: "Walnut Creek, CA", lat: 37.9101, lng: -122.0652 },
  { label: "Fremont, CA", lat: 37.5485, lng: -121.9886 },
  { label: "Sunnyvale, CA", lat: 37.3688, lng: -122.0363 },
  { label: "Redwood City, CA", lat: 37.4852, lng: -122.2364 },
  { label: "San Mateo, CA", lat: 37.5630, lng: -122.3255 },
] as const;

const FIRST_NAMES = [
  "Alex", "Jordan", "Morgan", "Casey", "Riley", "Jamie", "Taylor", "Quinn",
  "Drew", "Sam", "Chris", "Pat", "Blake", "Cameron", "Reese", "Marco",
  "Elena", "Marcus", "Sofia", "James", "Maria", "David", "Lisa", "Ryan", "Jennifer",
];

const LAST_NAMES = [
  "Chen", "Martinez", "Kim", "Thompson", "Garcia", "Williams", "Nguyen",
  "Rodriguez", "Brown", "Davis", "Wilson", "Moore", "Taylor", "Anderson",
  "Jackson", "White", "Harris", "Clark", "Lewis", "Walker",
];

const BIO_TEMPLATES = [
  "Former college athlete. I focus on fundamentals and game IQ.",
  "10+ years coaching youth. Safe, fun, and structured sessions.",
  "USPTA certified. I help players of all ages build confidence and technique.",
  "Pro experience in multiple sports. I bring a holistic approach to training.",
  "Specialize in speed and agility. Great for multi-sport athletes.",
  "I love helping kids fall in love with the game. Patience and positivity first.",
  "Competitive background; now I train the next generation. Results-driven.",
  "Emphasis on injury prevention and proper form. Long-term development.",
  "Beginner-friendly. I meet you where you are and build from there.",
  "High-energy sessions. We work hard and have fun doing it.",
  "Technical focus with lots of reps. You'll see progress fast.",
  "Former high school coach. I know what it takes to compete at the next level.",
  "Small groups and 1:1. Personalized plans for every athlete.",
  "Certified strength and conditioning. Sport-specific conditioning included.",
  "I coach because I believe every athlete can improve with the right guidance.",
];

function pick<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

const PICSUM_BASE = "https://picsum.photos/seed";
function photoUrl(seed: string, size = 300): string {
  return `${PICSUM_BASE}/${encodeURIComponent(seed)}/${size}/${size}`;
}

export interface SeedResult {
  seeded: number;
  slotsAdded: number;
}

/** Seed the marketplace with `count` coaches. Idempotent: re-run updates existing and adds more if count increases. */
export async function runSeed(prisma: PrismaClient, count: number): Promise<SeedResult> {
  const capped = Math.min(Math.max(1, count), 200);

  for (let i = 0; i < capped; i++) {
    const email = `coach-${i + 1}@seed.apexsports.local`;
    const firstName = pickOne(FIRST_NAMES);
    const lastName = pickOne(LAST_NAMES);
    const displayName = `${firstName} ${lastName}`;
    const sports = pick(ALLOWED_SPORTS as unknown as readonly string[], 1 + Math.floor(Math.random() * 3));
    const numCities = 1 + Math.floor(Math.random() * 4);
    const seedCities = pick(SEED_CITIES, numCities);
    const serviceCities = seedCities.map((c) => c.label);
    const bio = pickOne(BIO_TEMPLATES);
    const hourlyRate = 50 + Math.floor(Math.random() * 71);
    const verified = Math.random() < 0.8;

    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: displayName, cognitoSub: null },
      update: { name: displayName },
    });

    const profile = await prisma.coachProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName,
        sports,
        serviceCities,
        bio,
        hourlyRate,
        verified,
      },
      update: {
        displayName,
        sports,
        serviceCities,
        bio,
        hourlyRate,
        verified,
      },
    });

    // Seed service areas
    const existingAreas = await prisma.serviceArea.count({ where: { coachProfileId: profile.id } });
    if (existingAreas === 0) {
      for (const city of seedCities) {
        await prisma.serviceArea.create({
          data: { coachProfileId: profile.id, label: city.label, latitude: city.lat, longitude: city.lng, radiusMiles: 15 },
        });
      }
    }

    const existingPhotos = await prisma.coachPhoto.count({
      where: { coachProfileId: profile.id },
    });

    if (existingPhotos === 0) {
      const numPhotos = 1 + Math.floor(Math.random() * 3);
      const seedBase = `coach-${profile.id}`;
      const urls = [
        photoUrl(seedBase),
        ...(numPhotos > 1 ? [photoUrl(`${seedBase}-2`)] : []),
        ...(numPhotos > 2 ? [photoUrl(`${seedBase}-3`)] : []),
      ];
      for (let o = 0; o < urls.length; o++) {
        await prisma.coachPhoto.create({
          data: { coachProfileId: profile.id, url: urls[o], sortOrder: o },
        });
      }
      await prisma.coachProfile.update({
        where: { id: profile.id },
        data: { avatarUrl: urls[0] },
      });
    }
  }

  let slotsAdded = 0;
  for (let i = 0; i < capped; i++) {
    const email = `coach-${i + 1}@seed.apexsports.local`;
    const user = await prisma.user.findUnique({ where: { email }, include: { coachProfile: true } });
    const profile = user?.coachProfile;
    if (!profile) continue;
    const existing = await prisma.availabilitySlot.count({ where: { coachId: profile.id } });
    if (existing > 0) continue;
    const dayOffset = 1 + (i % 7);
    const start = new Date();
    start.setDate(start.getDate() + dayOffset);
    start.setHours(9 + (i % 4), 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1, 0, 0, 0);
    await prisma.availabilitySlot.create({
      data: { coachId: profile.id, startTime: start, endTime: end },
    });
    slotsAdded += 1;
  }

  return { seeded: capped, slotsAdded };
}
