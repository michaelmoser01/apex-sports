import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { sendNewAthleteConnectedToCoach } from "../notifications.js";

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
      coachProfile: { include: { invite: { select: { slug: true } } } },
      athleteProfiles: true,
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
  // Backfill signupRole for existing athletes who have a profile but no role set
  if (signupRole === null && dbUser.athleteProfiles.length > 0) {
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { signupRole: "athlete" },
    });
    signupRole = "athlete";
  }

  // Backfill AthleteProfile for existing athletes (created before we added the profile model)
  let athleteProfile = dbUser.athleteProfiles[0] ?? null;
  if (signupRole === "athlete" && !athleteProfile) {
    athleteProfile = await prisma.athleteProfile.create({
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
          inviteSlug: (dbUser.coachProfile as { invite?: { slug: string } | null }).invite?.slug ?? null,
        }
      : null,
    athleteProfile: athleteProfile
      ? {
          id: athleteProfile.id,
          displayName: athleteProfile.displayName,
          serviceCity: athleteProfile.serviceCity,
          birthYear: athleteProfile.birthYear,
          sports: athleteProfile.sports,
          level: athleteProfile.level,
          phone: athleteProfile.phone ?? null,
        }
      : null,
  });
});

router.patch("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as { signupRole?: string; inviteSlug?: string };
  const signupRole = body.signupRole === "coach" || body.signupRole === "athlete" ? body.signupRole : null;
  if (!signupRole) return res.status(400).json({ error: "signupRole must be 'coach' or 'athlete'" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { signupRole: true, name: true },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });
  if (dbUser.signupRole != null) return res.status(400).json({ error: "signupRole already set" });

  await prisma.user.update({
    where: { id: user.id },
    data: { signupRole },
  });

  let athleteProfileId: string | null = null;
  if (signupRole === "athlete") {
    const existingAthleteProfile = await prisma.athleteProfile.findFirst({
      where: { userId: user.id },
    });
    if (!existingAthleteProfile) {
      const created = await prisma.athleteProfile.create({
        data: {
          userId: user.id,
          displayName: dbUser.name ?? "",
          serviceCity: null,
          birthYear: null,
          sports: [],
          level: null,
        },
      });
      athleteProfileId = created.id;
    } else {
      athleteProfileId = existingAthleteProfile.id;
    }
  }

  if (signupRole === "athlete" && athleteProfileId && typeof body.inviteSlug === "string" && body.inviteSlug.trim()) {
    const slug = body.inviteSlug.trim().toLowerCase();
    const invite = await prisma.coachInvite.findUnique({
      where: { slug },
      select: { coachProfileId: true },
    });
    if (invite) {
      const existingLink = await prisma.coachAthlete.findUnique({
        where: {
          coachProfileId_athleteProfileId: {
            coachProfileId: invite.coachProfileId,
            athleteProfileId,
          },
        },
      });
      if (!existingLink) {
        await prisma.coachAthlete.create({
          data: {
            coachProfileId: invite.coachProfileId,
            athleteProfileId,
            status: "active",
          },
        });
        const [coach, athlete] = await Promise.all([
          prisma.coachProfile.findUnique({
            where: { id: invite.coachProfileId },
            select: { user: { select: { email: true } } },
          }),
          prisma.athleteProfile.findUnique({
            where: { id: athleteProfileId },
            select: { displayName: true },
          }),
        ]);
        const coachEmail = coach?.user?.email;
        if (coachEmail?.trim()) {
          sendNewAthleteConnectedToCoach({
            coachEmail: coachEmail.trim(),
            athleteDisplayName: athlete?.displayName ?? dbUser.name ?? "An athlete",
          }).catch((err) => console.error("[auth] sendNewAthleteConnectedToCoach failed:", err));
        }
      }
    }
  }

  res.json({ signupRole });
});

/** Link existing athlete to coach via invite slug and notify coach. Used when an existing account follows a coach link. */
router.post("/me/connect-invite", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as { inviteSlug?: string };
  const rawSlug = typeof body.inviteSlug === "string" ? body.inviteSlug.trim() : "";
  if (!rawSlug) return res.status(400).json({ error: "inviteSlug is required" });
  const slug = rawSlug.toLowerCase();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      athleteProfiles: { select: { id: true, displayName: true }, take: 1 },
      signupRole: true,
    },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });
  const athleteProfile = dbUser.athleteProfiles[0];
  if (!athleteProfile)
    return res.status(400).json({ error: "Athlete profile required to connect via invite" });

  const invite = await prisma.coachInvite.findUnique({
    where: { slug },
    select: { coachProfileId: true },
  });
  if (!invite) return res.status(404).json({ error: "Invite not found" });

  const existingLink = await prisma.coachAthlete.findUnique({
    where: {
      coachProfileId_athleteProfileId: {
        coachProfileId: invite.coachProfileId,
        athleteProfileId: athleteProfile.id,
      },
    },
  });
  if (existingLink) return res.json({ linked: true, alreadyLinked: true });

  await prisma.coachAthlete.create({
    data: {
      coachProfileId: invite.coachProfileId,
      athleteProfileId: athleteProfile.id,
      status: "active",
    },
  });

  const coach = await prisma.coachProfile.findUnique({
    where: { id: invite.coachProfileId },
    select: { user: { select: { email: true } } },
  });
  const coachEmail = coach?.user?.email;
  if (coachEmail?.trim()) {
    sendNewAthleteConnectedToCoach({
      coachEmail: coachEmail.trim(),
      athleteDisplayName: athleteProfile.displayName ?? dbUser.name ?? "An athlete",
    }).catch((err) => console.error("[auth] sendNewAthleteConnectedToCoach failed:", err));
  }

  res.json({ linked: true });
});

// Test cleanup: delete a user by email from DB + Cognito (dev stage only)
router.delete("/test-cleanup", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not available" });
  }

  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email) return res.status(400).json({ error: "email query param required" });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, cognitoSub: true, email: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Delete from Cognito if they have a sub
  if (user.cognitoSub && process.env.COGNITO_USER_POOL_ID) {
    try {
      const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = await import("@aws-sdk/client-cognito-identity-provider");
      const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION ?? "us-east-1" });
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: user.cognitoSub,
      }));
    } catch (err) {
      console.warn("[test-cleanup] Cognito delete failed:", err);
    }
  }

  // Delete from DB (cascades to profiles, bookings, reviews, etc.)
  await prisma.user.delete({ where: { id: user.id } });

  res.json({ deleted: true });
});

export default router;
