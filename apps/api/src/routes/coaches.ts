import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import {
  coachProfileSchema,
  coachProfileUpdateSchema,
  availabilitySlotCreateSchema,
  availabilityRuleCreateSchema,
} from "@apex-sports/shared";
import { Prisma } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { sendBookingStatusToAthlete } from "../notifications.js";
import { stripe, isStripeEnabled } from "../stripe.js";

const router = Router();
const s3Client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

// Get own coach profile (resilient: if photos relation fails e.g. missing table, return profile with photos: [])
router.get("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  let profile: (Awaited<ReturnType<typeof prisma.coachProfile.findUnique>> & { photos?: { id: string; url: string; sortOrder: number }[] }) | null;
  try {
    profile = await prisma.coachProfile.findUnique({
      where: { userId: user.id },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
      },
    });
  } catch {
    profile = await prisma.coachProfile.findUnique({
      where: { userId: user.id },
    });
    profile = profile ? { ...profile, photos: [] } : null;
  }

  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const photos = "photos" in profile && Array.isArray(profile.photos)
    ? profile.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder }))
    : [];

  res.json({
    id: profile.id,
    displayName: profile.displayName,
    sports: profile.sports,
    serviceCities: profile.serviceCities,
    bio: profile.bio,
    hourlyRate: profile.hourlyRate?.toString(),
    verified: profile.verified,
    avatarUrl: profile.avatarUrl,
    photos,
    stripeConnectAccountId: profile.stripeConnectAccountId ?? null,
    stripeOnboardingComplete: profile.stripeOnboardingComplete ?? false,
  });
});

// Create Stripe Connect Express account (if needed) and return Account Link for onboarding
router.post("/me/connect-account-link", authMiddleware(), async (req, res) => {
  console.log("[coaches] connect-account-link requested");
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (!isStripeEnabled() || !stripe) {
    return res.status(501).json({
      error: "Payments not configured",
      detail: "Set STRIPE_SECRET_ARN on the API Lambda (AWS Secrets Manager secret with STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET) and redeploy. See docs/STRIPE-DEPLOY.md.",
    });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { email: true } } },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const returnUrl = `${appUrl}/dashboard/profile?connect=return`;
  const refreshUrl = `${appUrl}/dashboard/profile?connect=refresh`;

  let connectAccountId = profile.stripeConnectAccountId;

  try {
    if (!connectAccountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: profile.user.email ?? undefined,
        metadata: { apex_coach_id: profile.id },
      });
      connectAccountId = account.id;
      await prisma.coachProfile.update({
        where: { id: profile.id },
        data: { stripeConnectAccountId: connectAccountId },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    res.json({ url: accountLink.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coaches] connect-account-link error:", message, err);
    if (message.includes("signed up for Connect") || message.includes("Connect")) {
      return res.status(400).json({
        error: "Stripe Connect not enabled",
        detail: "Enable Connect for your Stripe account at https://dashboard.stripe.com/connect/accounts/overview then try again.",
      });
    }
    return res.status(502).json({
      error: "Payment setup failed",
      detail: message,
    });
  }
});

// Sync Connect onboarding status from Stripe (call after return from Stripe onboarding)
router.get("/me/connect-status", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    select: { stripeConnectAccountId: true, stripeOnboardingComplete: true },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  if (!profile.stripeConnectAccountId || !isStripeEnabled() || !stripe) {
    return res.json({
      stripeConnectAccountId: profile.stripeConnectAccountId,
      stripeOnboardingComplete: profile.stripeOnboardingComplete ?? false,
    });
  }

  const account = await stripe.accounts.retrieve(profile.stripeConnectAccountId);
  const onboardingComplete =
    account.details_submitted === true && (account.charges_enabled === true || account.payouts_enabled === true);

  if (onboardingComplete !== profile.stripeOnboardingComplete) {
    await prisma.coachProfile.update({
      where: { userId: user.id },
      data: { stripeOnboardingComplete: onboardingComplete },
    });
  }

  res.json({
    stripeConnectAccountId: profile.stripeConnectAccountId,
    stripeOnboardingComplete: onboardingComplete,
  });
});

// Create or update own coach profile
router.put("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = coachProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  const photoUrls = Array.isArray((req.body as { photos?: string[] }).photos)
    ? (req.body as { photos: string[] }).photos.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : undefined;

  const existing = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });

  if (!existing && (!data.displayName || !(data.sports?.length) || !(data.serviceCities?.length))) {
    return res.status(400).json({
      error: "displayName, at least one sport, and at least one service city are required when creating coach profile",
    });
  }

  const hourlyRate =
    data.hourlyRate != null && Number.isFinite(data.hourlyRate)
      ? new Prisma.Decimal(data.hourlyRate)
      : null;

  const profile = await prisma.coachProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName: data.displayName ?? existing?.displayName ?? "",
      sports: data.sports?.length ? data.sports : existing?.sports ?? [],
      serviceCities: data.serviceCities?.length ? data.serviceCities : existing?.serviceCities ?? [],
      bio: data.bio ?? "",
      hourlyRate,
      phone: data.phone?.trim() || null,
    },
    update: {
      ...(data.displayName != null && { displayName: data.displayName }),
      ...(data.sports != null && { sports: data.sports }),
      ...(data.serviceCities != null && { serviceCities: data.serviceCities }),
      ...(data.bio != null && { bio: data.bio }),
      ...(data.hourlyRate != null && Number.isFinite(data.hourlyRate) && {
        hourlyRate: new Prisma.Decimal(data.hourlyRate),
      }),
      ...(data.phone !== undefined && { phone: data.phone?.trim() || null }),
    },
  });

  let photosSaveSkipped = false;
  if (photoUrls !== undefined) {
    try {
      await prisma.coachPhoto.deleteMany({ where: { coachProfileId: profile.id } });
      await prisma.coachPhoto.createMany({
        data: photoUrls.map((url, i) => ({
          coachProfileId: profile.id,
          url: url.trim(),
          sortOrder: i,
        })),
      });
    } catch (err) {
      console.error("PUT /coaches/me: failed to save photos", err);
      photosSaveSkipped = true;
    }
  }

  let updated: (Awaited<ReturnType<typeof prisma.coachProfile.findUnique>> & { photos?: { id: string; url: string; sortOrder: number }[] }) | null = null;
  try {
    updated = await prisma.coachProfile.findUnique({
      where: { id: profile.id },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
    });
  } catch {
    try {
      const fallback = await prisma.coachProfile.findUnique({
        where: { id: profile.id },
      });
      updated = fallback ? { ...fallback, photos: [] } : null;
    } catch {
      updated = null;
    }
  }

  // If both fetches failed (e.g. DB issue), use the upsert result so we still return 200
  const out = updated ?? {
    ...profile,
    photos: [] as { id: string; url: string; sortOrder: number }[],
  };
  const photos = "photos" in out && Array.isArray(out.photos)
    ? out.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder }))
    : [];

  res.json({
    id: out.id,
    displayName: out.displayName,
    sports: out.sports,
    serviceCities: out.serviceCities,
    bio: out.bio,
    hourlyRate: out.hourlyRate?.toString(),
    verified: out.verified,
    avatarUrl: out.avatarUrl,
    phone: out.phone ?? null,
    photos,
    ...(photosSaveSkipped && { photosSaveSkipped: true }),
  });
});

// Create coach profile (POST for initial creation)
router.post("/me", authMiddleware(), async (req, res) => {
  try {
    const user = (req as { user?: { id: string } }).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const parsed = coachProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const data = parsed.data;

    const photoUrls = Array.isArray((req.body as { photos?: string[] }).photos)
      ? (req.body as { photos: string[] }).photos.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
      : [];

    const existing = await prisma.coachProfile.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      return res.status(409).json({ error: "Coach profile already exists" });
    }

    const hourlyRate =
      data.hourlyRate != null && Number.isFinite(data.hourlyRate)
        ? new Prisma.Decimal(data.hourlyRate)
        : null;

    const profile = await prisma.coachProfile.create({
      data: {
        userId: user.id,
        displayName: data.displayName,
        sports: data.sports,
        serviceCities: data.serviceCities,
        bio: data.bio ?? "",
        hourlyRate,
        phone: data.phone?.trim() || null,
      },
    });

    if (photoUrls.length > 0) {
      await prisma.coachPhoto.createMany({
        data: photoUrls.map((url, i) => ({
          coachProfileId: profile.id,
          url: url.trim(),
          sortOrder: i,
        })),
      });
    }

    const withPhotos = await prisma.coachProfile.findUnique({
      where: { id: profile.id },
      include: { photos: { orderBy: { sortOrder: "asc" } } },
    });

    res.status(201).json({
      id: withPhotos!.id,
      displayName: withPhotos!.displayName,
      sports: withPhotos!.sports,
      serviceCities: withPhotos!.serviceCities,
      phone: withPhotos!.phone ?? null,
      bio: withPhotos!.bio,
      hourlyRate: withPhotos!.hourlyRate?.toString(),
      verified: withPhotos!.verified,
      avatarUrl: withPhotos!.avatarUrl,
      photos: withPhotos!.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("POST /coaches/me error:", message, stack ?? "");
    res.status(500).json({
      error: "Failed to create coach profile",
      detail: message,
      ...(process.env.NODE_ENV !== "production" && stack && { stack }),
    });
  }
});

// Get presigned URL for uploading a profile photo (client uploads directly to S3, then adds url to profile)
router.post("/me/photos/presign", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!UPLOADS_BUCKET) {
    return res.status(503).json({ error: "Uploads not configured" });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const contentType = (req.body as { contentType?: string }).contentType ?? "image/jpeg";
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(contentType)) {
    return res.status(400).json({ error: "Invalid contentType; use image/jpeg, image/png, image/gif, or image/webp" });
  }

  const ext = contentType.split("/")[1] === "jpeg" ? "jpg" : contentType.split("/")[1];
  const key = `coaches/${profile.id}/${randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket: UPLOADS_BUCKET,
    Key: key,
    ContentType: contentType,
    ACL: "public-read",
  });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
  const url = `https://${UPLOADS_BUCKET}.s3.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${key}`;

  res.json({ uploadUrl, url });
});

// Set which saved photo is used as the primary profile photo (avatar)
router.patch("/me/primary-photo", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const photoId = (req.body as { photoId?: string }).photoId;
  if (typeof photoId !== "string" || !photoId.trim()) {
    return res.status(400).json({ error: "photoId is required" });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const photo = await prisma.coachPhoto.findFirst({
    where: { id: photoId.trim(), coachProfileId: profile.id },
  });
  if (!photo)
    return res.status(404).json({ error: "Photo not found or not yours" });

  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: { avatarUrl: photo.url },
  });

  res.json({ ok: true });
});

// Availability: rules (recurring) + one-off slots
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;
const MAX_RULE_SPAN_MS = 2 * 365 * ONE_DAY_MS;

router.get("/me/availability", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const [rules, oneOffSlots] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { coachId: profile.id },
      include: {
        _count: { select: { slots: true } },
        slots: {
          include: {
            bookings: {
              where: { status: { not: "cancelled" } },
              select: { id: true },
            },
          },
        },
      },
      orderBy: { firstStartTime: "asc" },
    }),
    prisma.availabilitySlot.findMany({
      where: { coachId: profile.id, ruleId: null },
      orderBy: { startTime: "asc" },
    }),
  ]);

  res.json({
    rules: rules.map((r) => ({
      id: r.id,
      firstStartTime: r.firstStartTime.toISOString(),
      durationMinutes: r.durationMinutes,
      recurrence: r.recurrence,
      endDate: r.endDate.toISOString().slice(0, 10),
      slotCount: r._count.slots,
      bookingCount: r.slots.reduce((sum, s) => sum + s.bookings.length, 0),
    })),
    oneOffSlots: oneOffSlots.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      status: s.status,
    })),
  });
});

// Create a single one-off slot (no rule).
router.post("/me/availability", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const parsed = availabilitySlotCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { startTime, durationMinutes, recurrence } = parsed.data;
  if (recurrence !== "none") {
    return res.status(400).json({
      error: "Use POST /me/availability/rules for recurring availability.",
    });
  }

  const firstStart = new Date(startTime);
  const durationMs = durationMinutes * 60 * 1000;
  const firstEnd = new Date(firstStart.getTime() + durationMs);

  const slot = await prisma.availabilitySlot.create({
    data: {
      coachId: profile.id,
      startTime: firstStart,
      endTime: firstEnd,
      recurrence: "none",
    },
  });
  return res.status(201).json({
    id: slot.id,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    status: slot.status,
  });
});

// Create a recurring rule and generate slots up to endDate (max 2 years).
router.post("/me/availability/rules", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const parsed = availabilityRuleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { firstStartTime, durationMinutes, endDate } = parsed.data;
  const firstStart = new Date(firstStartTime);
  const endDateObj = new Date(endDate + "T23:59:59.999Z");
  const durationMs = durationMinutes * 60 * 1000;
  const maxEnd = new Date(firstStart.getTime() + MAX_RULE_SPAN_MS);
  const cap = endDateObj > maxEnd ? maxEnd : endDateObj;

  const rule = await prisma.availabilityRule.create({
    data: {
      coachId: profile.id,
      firstStartTime: firstStart,
      durationMinutes,
      recurrence: "weekly",
      endDate: cap,
    },
  });

  const slotTimes: { start: Date; end: Date }[] = [];
  let t = firstStart.getTime();
  while (t <= cap.getTime()) {
    const start = new Date(t);
    const end = new Date(t + durationMs);
    slotTimes.push({ start, end });
    t += ONE_WEEK_MS;
  }

  await prisma.availabilitySlot.createMany({
    data: slotTimes.map(({ start, end }) => ({
      coachId: profile.id,
      ruleId: rule.id,
      startTime: start,
      endTime: end,
      recurrence: "weekly",
    })),
  });

  const slotCount = slotTimes.length;
  return res.status(201).json({
    id: rule.id,
    firstStartTime: rule.firstStartTime.toISOString(),
    durationMinutes: rule.durationMinutes,
    recurrence: rule.recurrence,
    endDate: rule.endDate.toISOString().slice(0, 10),
    slotCount,
  });
});

// Delete a rule and all its slots. Cancels non-cancelled bookings and emails athletes, then deletes rule.
router.delete("/me/availability/rules/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const rule = await prisma.availabilityRule.findFirst({
    where: { id: req.params.id, coachId: profile.id },
    include: {
      slots: {
        include: {
          bookings: {
            where: { status: { not: "cancelled" } },
            include: {
              athlete: { select: { email: true, name: true } },
              coach: { select: { displayName: true } },
              slot: true,
            },
          },
        },
      },
    },
  });
  if (!rule)
    return res.status(404).json({ error: "Rule not found" });

  const bookingsToCancel = rule.slots.flatMap((s) => s.bookings);
  for (const b of bookingsToCancel) {
    await prisma.booking.update({
      where: { id: b.id },
      data: { status: "cancelled" },
    });
    sendBookingStatusToAthlete({
      athleteEmail: b.athlete.email,
      athleteName: b.athlete.name ?? undefined,
      coachDisplayName: b.coach.displayName,
      newStatus: "cancelled",
      slotStart: b.slot.startTime.toISOString(),
      slotEnd: b.slot.endTime.toISOString(),
    }).catch((err) => console.error("[coaches] cancel booking email failed:", err));
  }

  await prisma.availabilityRule.delete({
    where: { id: rule.id },
  });
  return res.status(204).send();
});

// Delete a single slot. Cancels non-cancelled bookings and emails athletes, then deletes slot.
router.delete("/me/availability/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const slot = await prisma.availabilitySlot.findFirst({
    where: { id: req.params.id, coachId: profile.id },
    include: {
      bookings: {
        where: { status: { not: "cancelled" } },
        include: {
          athlete: { select: { email: true, name: true } },
          coach: { select: { displayName: true } },
          slot: true,
        },
      },
    },
  });
  if (!slot)
    return res.status(404).json({ error: "Slot not found" });

  for (const b of slot.bookings) {
    await prisma.booking.update({
      where: { id: b.id },
      data: { status: "cancelled" },
    });
    sendBookingStatusToAthlete({
      athleteEmail: b.athlete.email,
      athleteName: b.athlete.name ?? undefined,
      coachDisplayName: b.coach.displayName,
      newStatus: "cancelled",
      slotStart: b.slot.startTime.toISOString(),
      slotEnd: b.slot.endTime.toISOString(),
    }).catch((err) => console.error("[coaches] cancel booking email failed:", err));
  }

  await prisma.availabilitySlot.deleteMany({
    where: { id: req.params.id, coachId: profile.id },
  });
  return res.status(204).send();
});

// Public: list coaches (filtered, search, paginated)
router.get("/", async (req, res) => {
  const sport = (req.query.sport as string | undefined)?.trim();
  const city = (req.query.city as string | undefined)?.trim();
  const q = (req.query.q as string | undefined)?.trim();
  const pageRaw = req.query.page;
  const limitRaw = req.query.limit;
  const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(limitRaw), 10) || 12));

  const conditions: Prisma.CoachProfileWhereInput[] = [];
  if (sport) conditions.push({ sports: { has: sport } });
  if (city) conditions.push({ serviceCities: { has: city } });
  if (q) {
    conditions.push({
      OR: [
        { displayName: { contains: q, mode: "insensitive" } },
        { bio: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.CoachProfileWhereInput = conditions.length > 0 ? { AND: conditions } : {};

  const [coaches, total] = await Promise.all([
    prisma.coachProfile.findMany({
      where,
      orderBy: [
        { reviews: { _count: "desc" } },
        { displayName: "asc" },
      ],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        _count: { select: { reviews: true } },
        reviews: { select: { rating: true } },
      },
    }),
    prisma.coachProfile.count({ where }),
  ]);

  const withAvgRating = coaches.map((c) => {
    const avg =
      c.reviews.length > 0
        ? c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length
        : null;
    return {
      id: c.id,
      displayName: c.displayName,
      sports: c.sports,
      serviceCities: c.serviceCities,
      bio: c.bio,
      hourlyRate: c.hourlyRate?.toString(),
      verified: c.verified,
      avatarUrl: c.avatarUrl,
      photos: c.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
      reviewCount: c._count.reviews,
      averageRating: avg ? Math.round(avg * 10) / 10 : null,
    };
  });

  res.json({ coaches: withAvgRating, total, page, limit });
});

// Public: get coach by id
router.get("/:id", async (req, res) => {
  const coach = await prisma.coachProfile.findUnique({
    where: { id: req.params.id },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      availabilitySlots: {
        where: {
          startTime: { gte: new Date() },
          status: "available",
          NOT: {
            bookings: {
              some: { status: { in: ["confirmed", "completed"] } },
            },
          },
        },
        orderBy: { startTime: "asc" },
      },
      reviews: {
        include: { athlete: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      _count: { select: { reviews: true } },
    },
  });

  if (!coach) return res.status(404).json({ error: "Coach not found" });

  const avgRating =
    coach.reviews.length > 0
      ? coach.reviews.reduce((s, r) => s + r.rating, 0) / coach.reviews.length
      : null;

  res.json({
    id: coach.id,
    displayName: coach.displayName,
    sports: coach.sports,
    serviceCities: coach.serviceCities,
    bio: coach.bio,
    hourlyRate: coach.hourlyRate?.toString(),
    verified: coach.verified,
    avatarUrl: coach.avatarUrl,
    photos: coach.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
    availabilitySlots: coach.availabilitySlots.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
    })),
    reviews: coach.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      athleteName: r.athlete?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    reviewCount: coach._count.reviews,
    averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
  });
});

export default router;
