import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";

const router = Router();

function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "OPTIONS") { next(); return; }
  const key = req.headers["x-admin-key"];
  const expected = process.env.ADMIN_API_KEY;
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

router.delete("/coaches/:id", async (req: Request, res: Response) => {
  const profile = await prisma.coachProfile.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, cognitoSub: true } } },
  });
  if (!profile) { res.status(404).json({ error: "Coach not found" }); return; }

  if (profile.user.cognitoSub && process.env.COGNITO_USER_POOL_ID) {
    try {
      const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = await import("@aws-sdk/client-cognito-identity-provider");
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION ?? "us-east-1" });
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: profile.user.cognitoSub,
      }));
    } catch (err) {
      console.warn("[admin] Cognito delete failed:", err);
    }
  }

  await prisma.user.delete({ where: { id: profile.user.id } });

  res.json({ deleted: true });
});

export default router;
