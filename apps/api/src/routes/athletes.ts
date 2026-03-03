import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { athleteProfileSchema, athleteProfileUpdateSchema } from "@apex-sports/shared";

const router = Router();

// Get own athlete profile
router.get("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      athleteProfile: true,
    },
  });

  if (!dbUser) return res.status(404).json({ error: "User not found" });

  let profile = dbUser.athleteProfile;
  if (!profile) {
    profile = await prisma.athleteProfile.create({
      data: {
        userId: dbUser.id,
        displayName: dbUser.name ?? "",
        serviceCity: null,
        birthYear: null,
        sports: [],
        level: null,
      },
    });
  }

  res.json({
    id: profile.id,
    displayName: profile.displayName,
    serviceCity: profile.serviceCity,
    birthYear: profile.birthYear,
    sports: profile.sports,
    level: profile.level,
  });
});

// Create or update own athlete profile
router.put("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = athleteProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });

  const existing = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
  });

  const profile = await prisma.athleteProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName: data.displayName ?? existing?.displayName ?? dbUser.name ?? "",
      serviceCity:
        data.serviceCity !== undefined
          ? data.serviceCity
          : existing?.serviceCity ?? null,
      birthYear:
        data.birthYear !== undefined
          ? data.birthYear ?? null
          : existing?.birthYear ?? null,
      sports:
        data.sports && data.sports.length > 0
          ? data.sports
          : existing?.sports ?? [],
      level:
        data.level !== undefined ? data.level ?? null : existing?.level ?? null,
    },
    update: {
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.serviceCity !== undefined && { serviceCity: data.serviceCity }),
      ...(data.birthYear !== undefined && { birthYear: data.birthYear ?? null }),
      ...(data.sports !== undefined && { sports: data.sports }),
      ...(data.level !== undefined && { level: data.level ?? null }),
    },
  });

  res.json({
    id: profile.id,
    displayName: profile.displayName,
    serviceCity: profile.serviceCity,
    birthYear: profile.birthYear,
    sports: profile.sports,
    level: profile.level,
  });
});

export default router;

