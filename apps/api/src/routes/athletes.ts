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
      athleteProfiles: true,
      coachProfile: { select: { id: true } },
    },
  });

  if (!dbUser) return res.status(404).json({ error: "User not found" });

  let profile = dbUser.athleteProfiles[0] ?? null;
  if (!profile) {
    if (dbUser.signupRole === "coach" || dbUser.coachProfile) {
      return res.status(404).json({ error: "No athlete profile. You signed up as a coach." });
    }
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
    phone: profile.phone ?? null,
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
    select: { id: true, name: true, signupRole: true, coachProfile: { select: { id: true } } },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });

  if (dbUser.signupRole === "coach" || dbUser.coachProfile) {
    return res.status(403).json({ error: "Coach accounts cannot create or update athlete profiles." });
  }

  const existing = await prisma.athleteProfile.findFirst({
    where: { userId: user.id },
  });

  let profile;
  if (existing) {
    profile = await prisma.athleteProfile.update({
      where: { id: existing.id },
      data: {
        ...(data.displayName !== undefined && { displayName: data.displayName }),
        ...(data.serviceCity !== undefined && { serviceCity: data.serviceCity }),
        ...(data.birthYear !== undefined && { birthYear: data.birthYear ?? null }),
        ...(data.sports !== undefined && { sports: data.sports }),
        ...(data.level !== undefined && { level: data.level ?? null }),
        ...(data.phone !== undefined && { phone: data.phone ?? null }),
      },
    });
  } else {
    profile = await prisma.athleteProfile.create({
      data: {
        userId: user.id,
        displayName: data.displayName ?? dbUser.name ?? "",
        serviceCity: data.serviceCity !== undefined ? data.serviceCity : null,
        birthYear: data.birthYear !== undefined ? data.birthYear ?? null : null,
        sports: data.sports && data.sports.length > 0 ? data.sports : [],
        level: data.level !== undefined ? data.level ?? null : null,
        phone: data.phone ?? null,
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
    phone: profile.phone ?? null,
  });
});

export default router;

