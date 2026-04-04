import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";

const router = Router();

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS") { next(); return; }
  const key = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_API_KEY;
  // #region agent log
  console.log("[DEBUG-8f1486] adminAuth", { method: req.method, hasKey: !!key, hasExpected: !!expected, keyMatch: key === expected, expectedLen: expected?.length, keyLen: typeof key === "string" ? key.length : 0 });
  // #endregion
  if (!expected) {
    if (!key) { res.status(401).json({ error: "Unauthorized" }); return; }
    next();
    return;
  }
  if (key !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(adminAuth);

router.get("/coaches", async (_req: Request, res: Response) => {
  const coaches = await prisma.coachProfile.findMany({
    include: {
      user: { select: { email: true, createdAt: true } },
      photos: { select: { id: true } },
      _count: { select: { reviews: true, bookings: true } },
    },
    orderBy: { user: { createdAt: "desc" } },
  });

  const result = coaches.map((c) => {
    const hasBio = !!c.bio && c.bio.trim() !== "";
    const hasHourlyRate = c.hourlyRate !== null;
    const onboardingComplete = hasBio && hasHourlyRate;

    let credentials: Record<string, unknown> | null = null;
    if (c.credentials && typeof c.credentials === "object" && !Array.isArray(c.credentials)) {
      credentials = c.credentials as Record<string, unknown>;
    }

    return {
      id: c.id,
      displayName: c.displayName,
      email: c.user.email,
      sports: c.sports,
      serviceCities: c.serviceCities,
      createdAt: c.user.createdAt,
      hasProfile: true,
      hasHourlyRate,
      hasBio,
      isVerified: c.verified,
      hasStripe: c.stripeOnboardingComplete,
      onboardingComplete,
      bio: c.bio || null,
      hourlyRate: c.hourlyRate?.toString() ?? null,
      phone: c.phone ?? null,
      credentials,
      avatarUrl: c.avatarUrl ?? null,
      photoCount: c.photos.length,
      reviewCount: c._count.reviews,
      bookingCount: c._count.bookings,
    };
  });

  res.json(result);
});

export default router;
