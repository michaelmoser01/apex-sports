import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";

const router = Router();

function isDevAuthAllowed() {
  return !process.env.COGNITO_USER_POOL_ID && process.env.NODE_ENV !== "production";
}

router.get("/dev-users", async (_req, res) => {
  if (!isDevAuthAllowed()) {
    return res.status(404).json({ error: "Not available" });
  }
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true },
  });
  res.json(users);
});

router.post("/dev-signup", async (req, res) => {
  if (!isDevAuthAllowed()) {
    return res.status(404).json({ error: "Not available" });
  }
  const { email, name } = req.body as { email?: string; name?: string };
  const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!trimmedEmail) {
    return res.status(400).json({ error: "Email is required" });
  }
  const trimmedName = typeof name === "string" ? name.trim() || null : null;
  const user = await prisma.user.upsert({
    where: { email: trimmedEmail },
    create: {
      email: trimmedEmail,
      name: trimmedName,
      cognitoSub: null,
    },
    update: {},
    select: { id: true, email: true, name: true },
  });
  res.status(201).json(user);
});

router.get("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      coachProfile: true,
    },
  });

  if (!dbUser) return res.status(404).json({ error: "User not found" });

  // Backfill signupRole for existing coaches (created before we added the field)
  let signupRole = dbUser.signupRole ?? null;
  if (signupRole === null && dbUser.coachProfile) {
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { signupRole: "coach" },
    });
    signupRole = "coach";
  }

  res.json({
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    signupRole,
    coachProfile: dbUser.coachProfile
      ? {
          id: dbUser.coachProfile.id,
          displayName: dbUser.coachProfile.displayName,
          sports: dbUser.coachProfile.sports,
          serviceCities: dbUser.coachProfile.serviceCities,
          bio: dbUser.coachProfile.bio,
          hourlyRate: dbUser.coachProfile.hourlyRate?.toString(),
          verified: dbUser.coachProfile.verified,
          avatarUrl: dbUser.coachProfile.avatarUrl,
          phone: dbUser.coachProfile.phone ?? null,
        }
      : null,
  });
});

router.patch("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as { signupRole?: string };
  const signupRole = body.signupRole === "coach" || body.signupRole === "athlete" ? body.signupRole : null;
  if (!signupRole) return res.status(400).json({ error: "signupRole must be 'coach' or 'athlete'" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { signupRole: true },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });
  if (dbUser.signupRole != null) return res.status(400).json({ error: "signupRole already set" });

  await prisma.user.update({
    where: { id: user.id },
    data: { signupRole },
  });

  res.json({ signupRole });
});

export default router;
