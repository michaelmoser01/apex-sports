import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { queueEmail } from "../emailQueue.js";

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
          avatarUrl: athleteProfile.avatarUrl ?? null,
          birthYear: athleteProfile.birthYear,
          sports: athleteProfile.sports,
          level: athleteProfile.level,
          phone: athleteProfile.phone ?? null,
        }
      : null,
  });
});

/**
 * Promote a CoachAthleteInvite to a real CoachAthlete connection.
 * - Returns true if a new link was created or the invite was promoted.
 * - Returns false if the invite was missing/invalid/expired.
 * - Idempotent: if the link already exists we still mark the invite promoted.
 * - Notifies the coach by email on the first successful connection.
 */
async function promoteInviteToken(
  rawToken: string,
  athleteProfileId: string,
  athleteDisplayNameFallback: string | null,
): Promise<{ ok: boolean; alreadyConnected?: boolean; coachProfileId?: string }> {
  const token = rawToken.trim();
  if (!token) return { ok: false };

  const invite = await prisma.coachAthleteInvite.findUnique({
    where: { token },
  });
  if (!invite) return { ok: false };
  if (invite.status === "cancelled") return { ok: false };

  let createdNew = false;
  let connectionId: string;
  const existingLink = await prisma.coachAthlete.findUnique({
    where: {
      coachProfileId_athleteProfileId: {
        coachProfileId: invite.coachProfileId,
        athleteProfileId,
      },
    },
  });
  if (existingLink) {
    connectionId = existingLink.id;
  } else {
    const created = await prisma.coachAthlete.create({
      data: {
        coachProfileId: invite.coachProfileId,
        athleteProfileId,
        status: "active",
      },
    });
    connectionId = created.id;
    createdNew = true;
  }

  if (invite.status !== "promoted") {
    await prisma.coachAthleteInvite.update({
      where: { id: invite.id },
      data: {
        status: "promoted",
        promotedAt: new Date(),
        promotedToCoachAthleteId: connectionId,
      },
    });
  }

  if (createdNew) {
    const coach = await prisma.coachProfile.findUnique({
      where: { id: invite.coachProfileId },
      select: { user: { select: { email: true } } },
    });
    const coachEmail = coach?.user?.email;
    if (coachEmail?.trim()) {
      const athlete = await prisma.athleteProfile.findUnique({
        where: { id: athleteProfileId },
        select: { displayName: true },
      });
      queueEmail("new_athlete_connected", {
        coachEmail: coachEmail.trim(),
        athleteDisplayName:
          athlete?.displayName ?? athleteDisplayNameFallback ?? invite.athleteName ?? "An athlete",
      }).catch((err) => console.error("[auth] queueEmail new_athlete_connected (token) failed:", err));
    }
  }

  return { ok: true, alreadyConnected: !createdNew, coachProfileId: invite.coachProfileId };
}

// Public: look up an invite by token so the claim page can render coach context
router.get("/claim/:token", async (req, res) => {
  const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
  if (!token) return res.status(400).json({ error: "token is required" });

  const invite = await prisma.coachAthleteInvite.findUnique({
    where: { token },
    include: {
      coach: { select: { displayName: true, avatarUrl: true } },
    },
  });
  if (!invite) return res.status(404).json({ error: "Invite not found", code: "INVITE_NOT_FOUND" });
  if (invite.status === "cancelled") {
    return res.status(410).json({ error: "This invite was cancelled", code: "INVITE_CANCELLED" });
  }

  res.json({
    status: invite.status, // "invited" | "promoted"
    athleteEmail: invite.athleteEmail,
    athleteName: invite.athleteName,
    parentName: invite.parentName,
    coach: {
      displayName: invite.coach.displayName,
      avatarUrl: invite.coach.avatarUrl,
    },
  });
});

router.patch("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as { signupRole?: string; inviteToken?: string };
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

  if (signupRole === "athlete" && athleteProfileId && typeof body.inviteToken === "string" && body.inviteToken.trim()) {
    await promoteInviteToken(body.inviteToken, athleteProfileId, dbUser.name).catch((err) =>
      console.error("[auth] promoteInviteToken (PATCH /me) failed:", err),
    );
  }

  res.json({ signupRole });
});

/** Link existing athlete to coach via an invite token (Version A+ flow). */
router.post("/me/connect-invite-token", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as { inviteToken?: string };
  const token = typeof body.inviteToken === "string" ? body.inviteToken.trim() : "";
  if (!token) return res.status(400).json({ error: "inviteToken is required" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      athleteProfiles: { select: { id: true }, take: 1 },
      signupRole: true,
    },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });

  const athleteProfile = dbUser.athleteProfiles[0];
  if (!athleteProfile) {
    return res
      .status(400)
      .json({ error: "Athlete profile required to accept this invite", code: "ATHLETE_PROFILE_REQUIRED" });
  }

  const result = await promoteInviteToken(token, athleteProfile.id, dbUser.name);
  if (!result.ok) {
    return res.status(404).json({ error: "Invite not found or no longer valid", code: "INVITE_INVALID" });
  }

  res.json({ linked: true, alreadyLinked: !!result.alreadyConnected });
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
