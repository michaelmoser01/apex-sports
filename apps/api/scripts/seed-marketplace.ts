/**
 * Seed the marketplace with coaches (realistic names, random sports/cities, bios, Picsum profile photos).
 * Does not duplicate photos if run again; adds more coaches if you increase the count.
 *
 * Usage (from repo root):
 *   pnpm exec tsx apps/api/scripts/seed-marketplace.ts [count]
 * Or from apps/api:
 *   npx tsx scripts/seed-marketplace.ts [count]
 * Or with env:
 *   SEED_COACHES=30 pnpm run seed:marketplace
 *
 * Requires DATABASE_URL. Default count 25.
 *
 * For deployed Aurora (DB in VPC), use the seed Lambda instead:
 *   aws lambda invoke --function-name apex-sports-dev-seed --payload '{"count":25}' out.json
 */

import { PrismaClient } from "@prisma/client";
import { runSeed } from "../src/seed-marketplace-logic.js";

const prisma = new PrismaClient();

function getCount(): number {
  const arg = process.argv[2];
  if (arg != null) {
    const n = parseInt(arg, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 200);
  }
  const env = process.env.SEED_COACHES;
  if (env != null) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 200);
  }
  return 25;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const count = getCount();
  console.log(`Seeding ${count} marketplace coaches...`);

  const { seeded, slotsAdded } = await runSeed(prisma, count);
  console.log(`Done. Seeded ${seeded} coaches. Added ${slotsAdded} availability slot(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
