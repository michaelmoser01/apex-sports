import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import {
  coachProfileSchema,
  coachProfileUpdateSchema,
  availabilitySlotCreateSchema,
  availabilityRuleCreateSchema,
  coachLocationCreateSchema,
  coachLocationUpdateSchema,
  serviceAreaSchema,
  serviceAreaUpdateSchema,
  credentialsSchema,
  type CoachCredentials,
} from "@apex-sports/shared";
import { Prisma } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID, randomBytes } from "node:crypto";
import { queueEmail } from "../emailQueue.js";
import { stripe, isStripeEnabled, createPlanCheckoutSession, createCoachPlanSubscription, getOrCreateStripeCustomerId } from "../stripe.js";
import { invokeBioDraft, isBedrockConfigured } from "../bedrock.js";
import { invokeCoachAgent, type AgentChatRole } from "../coachAgent.js";

const router = Router();
const s3Client = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

const RESERVED_SLUGS = new Set(["join", "api", "auth", "coaches", "bookings", "find", "welcome", "sign-up", "dashboard", "athlete", "webhooks", "health", "invites"]);

const GROUP_RATES_REQUIRED_BODY = {
  error:
    "Set group session pricing on your profile before offering multi-athlete slots. Go to Dashboard → Profile and add group rates under your hourly rate.",
  code: "GROUP_RATES_REQUIRED" as const,
};

function coachHasGroupRates(profile: { groupRates: Prisma.JsonValue | null }): boolean {
  const gr = profile.groupRates;
  if (gr === null || gr === undefined) return false;
  if (typeof gr !== "object" || Array.isArray(gr)) return false;
  return Object.keys(gr as Record<string, unknown>).length > 0;
}

/** Multi-athlete slots (maxCapacity > 1) require at least one group rate tier on the coach profile. */
function groupRatesRequiredResponse(
  maxCapacity: number,
  profile: { groupRates: Prisma.JsonValue | null },
): { status: 400; body: typeof GROUP_RATES_REQUIRED_BODY } | null {
  if (maxCapacity <= 1) return null;
  if (!coachHasGroupRates(profile)) return { status: 400, body: GROUP_RATES_REQUIRED_BODY };
  return null;
}

function interpolateRate(
  groupSize: number,
  groupRates: Record<string, number> | null | undefined,
  hourlyRate: number,
): number {
  if (!groupRates || typeof groupRates !== "object") return hourlyRate;
  const exact = groupRates[String(groupSize)];
  if (typeof exact === "number" && exact > 0) return exact;
  const defined = Object.entries(groupRates)
    .map(([k, v]) => ({ size: parseInt(k), rate: v }))
    .filter((e) => !isNaN(e.size) && typeof e.rate === "number" && e.rate > 0)
    .sort((a, b) => a.size - b.size);
  if (defined.length === 0) return hourlyRate;
  if (groupSize <= defined[0].size) return defined[0].rate;
  if (groupSize >= defined[defined.length - 1].size) return defined[defined.length - 1].rate;
  let lower = defined[0];
  let upper = defined[defined.length - 1];
  for (const d of defined) {
    if (d.size <= groupSize) lower = d;
    if (d.size >= groupSize && d.size < upper.size) upper = d;
  }
  if (lower.size === upper.size) return lower.rate;
  const fraction = (groupSize - lower.size) / (upper.size - lower.size);
  return Math.round(lower.rate + (upper.rate - lower.rate) * fraction);
}

function slugify(displayName: string): string {
  const s = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.slice(0, 50) || "coach";
}

async function ensureUniqueInviteSlug(prisma: typeof import("../db.js").prisma, baseSlug: string, excludeCoachProfileId?: string): Promise<string> {
  let slug = baseSlug;
  let n = 1;
  for (;;) {
    const existing = await prisma.coachInvite.findFirst({
      where: {
        slug,
        ...(excludeCoachProfileId ? { coachProfileId: { not: excludeCoachProfileId } } : {}),
      },
    });
    if (!existing) return slug;
    slug = `${baseSlug}-${n}`;
    n++;
  }
}

function parseCredentials(raw: unknown): CoachCredentials {
  const fallback: CoachCredentials = { certifications: [], yearsExperience: null, playingExperience: "", education: "" };
  if (!raw || typeof raw !== "object") return fallback;
  const result = credentialsSchema.safeParse(raw);
  return result.success ? result.data : fallback;
}

// Get own coach profile (resilient: if photos relation fails e.g. missing table, return profile with photos: [])
router.get("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  let profile: (Awaited<ReturnType<typeof prisma.coachProfile.findUnique>> & { photos?: { id: string; url: string; sortOrder: number }[]; serviceAreas?: { id: string; label: string; latitude: Prisma.Decimal; longitude: Prisma.Decimal; radiusMiles: number }[] }) | null;
  try {
    profile = await prisma.coachProfile.findUnique({
      where: { userId: user.id },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        serviceAreas: { orderBy: { label: "asc" } },
      },
    });
  } catch {
    profile = await prisma.coachProfile.findUnique({
      where: { userId: user.id },
    });
    profile = profile ? { ...profile, photos: [], serviceAreas: [] } : null;
  }

  if (!profile)
    return res.status(404).json({ error: "Coach profile not found" });

  const photos = "photos" in profile && Array.isArray(profile.photos)
    ? profile.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder }))
    : [];

  const serviceAreas = "serviceAreas" in profile && Array.isArray(profile.serviceAreas)
    ? profile.serviceAreas.map((a) => ({ id: a.id, label: a.label, latitude: Number(a.latitude), longitude: Number(a.longitude), radiusMiles: a.radiusMiles }))
    : [];

  res.json({
    id: profile.id,
    displayName: profile.displayName,
    sports: profile.sports,
    serviceCities: profile.serviceCities,
    serviceAreas,
    bio: profile.bio,
    hourlyRate: profile.hourlyRate?.toString(),
    verified: profile.verified,
    avatarUrl: profile.avatarUrl,
    phone: profile.phone ?? null,
    photos,
    credentials: parseCredentials(profile.credentials),
    stripeConnectAccountId: profile.stripeConnectAccountId ?? null,
    stripeOnboardingComplete: profile.stripeOnboardingComplete ?? false,
    assistantDisplayName: profile.assistantDisplayName ?? null,
    assistantPhoneNumber: profile.assistantPhoneNumber ?? null,
    assistantCapabilities: profile.assistantCapabilities ?? null,
    planId: profile.planId ?? null,
    billingMode: profile.billingMode ?? "after_session",
    feeMode: profile.feeMode ?? "pass_to_athlete",
    groupRates: profile.groupRates ?? null,
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
  const returnPath = (req.body as { returnPath?: string })?.returnPath?.trim();
  const path = returnPath && returnPath.startsWith("/") ? returnPath : "/dashboard/profile";
  const returnUrl = `${appUrl}${path}?connect=return`;
  const refreshUrl = `${appUrl}${path}?connect=refresh`;

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

// Generate a Stripe Express dashboard login link for the connected account
router.get("/me/stripe-dashboard", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    select: { stripeConnectAccountId: true, stripeOnboardingComplete: true },
  });
  if (!profile?.stripeConnectAccountId || !profile.stripeOnboardingComplete) {
    return res.status(400).json({ error: "Stripe Connect not set up" });
  }
  if (!isStripeEnabled() || !stripe) {
    return res.status(501).json({ error: "Stripe not configured" });
  }

  try {
    const loginLink = await stripe.accounts.createLoginLink(profile.stripeConnectAccountId);
    res.json({ url: loginLink.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coaches] stripe-dashboard error:", message, err);
    res.status(502).json({ error: "Could not generate Stripe dashboard link", detail: message });
  }
});

// Setup assistant (mocked: provisions a fake number; real Twilio later)
router.post("/me/assistant", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as {
    displayName?: string;
    coachPhone?: string;
    capabilities?: Record<string, boolean>;
  };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const coachPhone = typeof body.coachPhone === "string" ? body.coachPhone.replace(/\D/g, "") : "";
  const capabilities =
    body.capabilities && typeof body.capabilities === "object" && !Array.isArray(body.capabilities)
      ? (body.capabilities as Record<string, boolean>)
      : undefined;

  if (!displayName) return res.status(400).json({ error: "displayName is required" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  // Mock: derive area code from coach phone or use default 415
  const areaCode = coachPhone.length >= 3 ? coachPhone.slice(0, 3) : "415";
  const mockNumber = `+1${areaCode}555${String(profile.id.replace(/-/g, "").slice(0, 4)).padStart(4, "0")}`;

  await prisma.coachProfile.update({
    where: { userId: user.id },
    data: {
      assistantDisplayName: displayName,
      assistantPhoneNumber: mockNumber,
      ...(coachPhone && { phone: coachPhone.length >= 10 ? `+1${coachPhone}` : null }),
      ...(capabilities != null && { assistantCapabilities: capabilities }),
    },
  });

  res.json({ assistantPhoneNumber: mockNumber });
});

// Coach assistant agent chat (test harness: send as athlete or coach)
router.post("/me/agent/chat", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const body = req.body as { role?: string; message?: string; threadId?: string; athleteId?: string };
  const role = body.role === "athlete" || body.role === "coach" ? (body.role as AgentChatRole) : null;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const threadId = typeof body.threadId === "string" ? body.threadId.trim() || undefined : undefined;
  const athleteUserId = typeof body.athleteId === "string" ? body.athleteId.trim() || undefined : undefined;

  if (!role) return res.status(400).json({ error: "role must be 'athlete' or 'coach'" });
  if (!message) return res.status(400).json({ error: "message is required" });

  let athleteProfileId: string | undefined;
  if (role === "athlete" && athleteUserId) {
    const ap = await prisma.athleteProfile.findFirst({ where: { userId: athleteUserId }, select: { id: true } });
    athleteProfileId = ap?.id;
  }

  try {
    const result = await invokeCoachAgent({
      role,
      message,
      coachId: profile.id,
      threadId,
      athleteId: role === "athlete" ? athleteProfileId : undefined,
      coachDisplayName: profile.displayName ?? undefined,
    });
    res.json({
      agentReplyToSender: result.agentReplyToSender,
      toCoach: result.toCoach,
      toAthlete: result.toAthlete,
      thinking: result.thinking,
      toolCalls: result.toolCalls,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[coaches] agent/chat error:", msg);
    res.status(500).json({ error: "Agent error", detail: msg });
  }
});

const PLAN_PRICE_ENV_KEYS: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  elite: "STRIPE_PRICE_ELITE",
};

// Create Stripe Checkout Session for plan subscription (monthly fee charged to coach via platform Stripe)
router.post("/me/plan/checkout", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (!isStripeEnabled() || !stripe) {
    return res.status(501).json({ error: "Payments not configured" });
  }

  const body = req.body as { planId?: string; successUrl?: string; cancelUrl?: string };
  const planId = body.planId === "starter" || body.planId === "pro" || body.planId === "elite" ? body.planId : null;
  if (!planId) return res.status(400).json({ error: "planId must be starter, pro, or elite" });

  const priceEnvKey = PLAN_PRICE_ENV_KEYS[planId];
  const priceId = priceEnvKey ? process.env[priceEnvKey] : null;
  if (!priceId || !priceId.trim()) {
    console.error(`[coaches] Plan pricing missing: set ${priceEnvKey} (Stripe Price ID) for the ${planId} plan`);
    return res.status(503).json({
      error: "Plan pricing is not set up yet. Please try again later or contact support.",
    });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });
  if (!dbUser?.email) return res.status(400).json({ error: "User email is required for checkout" });

  const base = typeof body.successUrl === "string" && body.successUrl.trim() ? body.successUrl.trim() : null;
  const cancel = typeof body.cancelUrl === "string" && body.cancelUrl.trim() ? body.cancelUrl.trim() : null;
  if (!base || !cancel) return res.status(400).json({ error: "successUrl and cancelUrl are required" });

  try {
    const { url } = await createPlanCheckoutSession({
      customerEmail: dbUser.email,
      priceId: priceId.trim(),
      successUrl: base.includes("?") ? `${base}&session_id={CHECKOUT_SESSION_ID}` : `${base}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancel,
      metadata: { userId: user.id, planId },
    });
    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coaches] plan checkout error:", message);
    res.status(500).json({ error: "Failed to create checkout session", detail: message });
  }
});

// Verify Stripe Checkout Session or Subscription after plan payment and set planId on coach profile
router.get("/me/plan/checkout-success", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id.trim() : null;
  const subscriptionId = typeof req.query.subscription_id === "string" ? req.query.subscription_id.trim() : null;

  if (!stripe) return res.status(501).json({ error: "Payments not configured" });

  try {
    let planId: string | null = null;

    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice.payment_intent"],
      });
      const metadata = sub.metadata as { userId?: string; planId?: string } | null;
      if (!metadata?.userId || metadata.userId !== user.id) return res.status(403).json({ error: "Subscription does not belong to this user" });

      let invoiceStatus: string | undefined;
      let piStatus: string | undefined;
      const rawInvoice = sub.latest_invoice;
      if (typeof rawInvoice === "string") {
        const inv = await stripe.invoices.retrieve(rawInvoice, { expand: ["payment_intent"] });
        invoiceStatus = inv.status ?? undefined;
        const pi = inv.payment_intent as { status?: string } | null;
        piStatus = pi?.status;
      } else if (rawInvoice && typeof rawInvoice === "object" && "status" in rawInvoice) {
        invoiceStatus = (rawInvoice as { status?: string }).status;
        const pi = (rawInvoice as { payment_intent?: string | { status?: string } }).payment_intent;
        piStatus = typeof pi === "object" && pi?.status ? pi.status : undefined;
      }
      const paid =
        sub.status === "active" ||
        invoiceStatus === "paid" ||
        (piStatus && ["succeeded", "requires_capture", "processing", "requires_confirmation"].includes(piStatus));
      if (!paid) {
        const debug = { subStatus: sub.status, invoiceStatus, piStatus };
        console.warn("[coaches] checkout-success subscription not paid:", debug);
        return res.status(400).json({
          error: "Subscription not active",
          detail: `Stripe: sub=${sub.status}, invoice=${invoiceStatus ?? "n/a"}, paymentIntent=${piStatus ?? "n/a"}`,
        });
      }
      planId = metadata.planId === "starter" || metadata.planId === "pro" || metadata.planId === "elite" ? metadata.planId : null;
    } else if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
      if (session.payment_status !== "paid" && session.status !== "complete") return res.status(400).json({ error: "Checkout session not paid" });
      const metadata = session.metadata as { userId?: string; planId?: string } | null;
      if (!metadata?.userId || metadata.userId !== user.id) return res.status(403).json({ error: "Session does not belong to this user" });
      planId = metadata.planId === "starter" || metadata.planId === "pro" || metadata.planId === "elite" ? metadata.planId : null;
    } else {
      return res.status(400).json({ error: "session_id or subscription_id is required" });
    }

    if (!planId) return res.status(400).json({ error: "Invalid plan" });

    const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
    if (!profile) return res.status(404).json({ error: "Coach profile not found" });

    await prisma.coachProfile.update({
      where: { userId: user.id },
      data: { planId },
    });

    res.json({ planId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coaches] plan checkout-success error:", message);
    res.status(500).json({ error: "Failed to verify payment", detail: message });
  }
});

// Subscribe to a plan with inline card (payment method). Same UX as booking: card form on page.
router.post("/me/plan/subscribe", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (!isStripeEnabled() || !stripe) return res.status(501).json({ error: "Payments not configured" });

  const body = req.body as { planId?: string; paymentMethodId?: string };
  const planId = body.planId === "starter" || body.planId === "pro" || body.planId === "elite" ? body.planId : null;
  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : null;
  if (!planId) return res.status(400).json({ error: "planId must be starter, pro, or elite" });
  if (!paymentMethodId) return res.status(400).json({ error: "paymentMethodId is required" });

  const priceEnvKey = PLAN_PRICE_ENV_KEYS[planId];
  const priceId = priceEnvKey ? process.env[priceEnvKey] : null;
  if (!priceId?.trim()) {
    console.error(`[coaches] Plan pricing missing: set ${priceEnvKey} (Stripe Price ID) in your Stripe secret or env`);
    return res.status(503).json({ error: "Plan pricing is not set up yet. Please try again later or contact support." });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, stripeCustomerId: true },
  });
  if (!dbUser?.email) return res.status(400).json({ error: "User email is required" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  try {
    const customerId = await getOrCreateStripeCustomerId(
      stripe,
      user.id,
      dbUser.email,
      dbUser.stripeCustomerId
    );
    if (!dbUser.stripeCustomerId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const { subscriptionId, clientSecret, status } = await createCoachPlanSubscription({
      customerId,
      paymentMethodId,
      priceId: priceId.trim(),
      metadata: { userId: user.id, planId },
    });

    if (status === "active") {
      await prisma.coachProfile.update({
        where: { userId: user.id },
        data: { planId },
      });
      return res.json({ planId, subscriptionId });
    }

    res.json({ subscriptionId, clientSecret });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coaches] plan subscribe error:", message);
    res.status(500).json({ error: "Payment failed", detail: message });
  }
});

// Select plan (legacy: direct set without payment; prefer /me/plan/checkout for production)
router.post("/me/plan", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as { planId?: string };
  const planId = body.planId === "starter" || body.planId === "pro" || body.planId === "elite" ? body.planId : null;
  if (!planId) return res.status(400).json({ error: "planId must be starter, pro, or elite" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  await prisma.coachProfile.update({
    where: { userId: user.id },
    data: { planId },
  });

  res.json({ planId });
});


// Update coach credentials (certifications, experience, education)
router.put("/me/credentials", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: { credentials: parsed.data as unknown as Prisma.InputJsonValue },
  });

  res.json(parsed.data);
});

// Create or update own coach profile
router.put("/me", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const dbUserCheck = await prisma.user.findUnique({
    where: { id: user.id },
    select: { signupRole: true, athleteProfiles: { select: { id: true }, take: 1 }, coachProfile: { select: { id: true } } },
  });
  const hasExistingCoachProfile = !!dbUserCheck?.coachProfile;
  if (!hasExistingCoachProfile && (dbUserCheck?.signupRole === "athlete" || (dbUserCheck?.athleteProfiles?.length ?? 0) > 0)) {
    return res.status(403).json({
      error: "You signed up as an athlete. Use a different account to create a coach profile.",
    });
  }

  const parsed = coachProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const data = parsed.data;

  const photoUrls = Array.isArray((req.body as { photos?: string[] }).photos)
    ? (req.body as { photos: string[] }).photos.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    : undefined;

  const rawGroupRates = (req.body as { groupRates?: Record<string, number> }).groupRates;
  const groupRates = rawGroupRates && typeof rawGroupRates === "object" ? rawGroupRates : undefined;

  const rawFeeMode = (req.body as { feeMode?: string }).feeMode;
  const feeMode = rawFeeMode === "pass_to_athlete" || rawFeeMode === "coach_absorbs" ? rawFeeMode : undefined;

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
      ...(groupRates !== undefined && { groupRates: groupRates as Prisma.InputJsonValue }),
      ...(feeMode !== undefined && { feeMode }),
    },
  });

  if (!profile.verified && profile.bio && profile.hourlyRate && profile.displayName) {
    await prisma.coachProfile.update({
      where: { id: profile.id },
      data: { verified: true },
    });
  }

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
    stripeConnectAccountId: out.stripeConnectAccountId ?? null,
    stripeOnboardingComplete: out.stripeOnboardingComplete ?? false,
    assistantDisplayName: out.assistantDisplayName ?? null,
    assistantPhoneNumber: out.assistantPhoneNumber ?? null,
    assistantCapabilities: out.assistantCapabilities ?? null,
    planId: out.planId ?? null,
    billingMode: out.billingMode ?? "after_session",
    feeMode: out.feeMode ?? "pass_to_athlete",
    ...(photosSaveSkipped && { photosSaveSkipped: true }),
  });
});

// Generate or refine coach bio draft using LLM (Bedrock). Auth required.
router.post("/me/bio-draft", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  if (!isBedrockConfigured()) {
    return res.status(503).json({
      error: "Bio assistant not configured",
      detail: "Set BEDROCK_MODEL_ID (and optionally BEDROCK_REGION) to enable the coaching bio interview.",
    });
  }

  const body = req.body as {
    messages?: unknown[];
    currentBioPreview?: string;
    mode?: "generate" | "enhance";
    sourceText?: string;
  };
  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    select: { displayName: true, sports: true, serviceCities: true, credentials: true },
  });
  if (!profile) {
    return res.status(404).json({ error: "Coach profile not found. Create your profile first." });
  }

  const parsedCreds = parseCredentials(profile.credentials);
  const hasCredentials =
    (parsedCreds.certifications?.length ?? 0) > 0 ||
    (parsedCreds.yearsExperience != null && parsedCreds.yearsExperience > 0) ||
    !!parsedCreds.playingExperience?.trim() ||
    !!parsedCreds.education?.trim();

  const coachContext = {
    displayName: profile.displayName,
    sports: profile.sports?.length ? profile.sports : undefined,
    serviceCities: profile.serviceCities?.length ? profile.serviceCities : undefined,
    credentials: hasCredentials ? parsedCreds : undefined,
  };

  const mode = body.mode === "generate" || body.mode === "enhance" ? body.mode : undefined;
  if (mode === "enhance" && body.sourceText == null) {
    return res.status(400).json({
      error: "sourceText is required when mode is 'enhance'",
      detail: "Send { mode: 'enhance', sourceText: string }",
    });
  }

  let validMessages: Array<{ role: "user" | "assistant"; content: string }> | undefined;
  if (!mode) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    validMessages = messages
      .filter((m): m is { role: string; content: string } => m != null && typeof m === "object" && "role" in m && "content" in m && typeof (m as { content: unknown }).content === "string")
      .map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: (m as { content: string }).content,
      }));
    if (validMessages.length === 0) {
      return res.status(400).json({
        error: "At least one message is required, or use mode 'generate' or 'enhance'",
        detail: "Send { messages: [...] } or { mode: 'generate' } or { mode: 'enhance', sourceText: string }",
      });
    }
  }

  try {
    const result = await invokeBioDraft({
      messages: validMessages,
      currentBioPreview: typeof body.currentBioPreview === "string" ? body.currentBioPreview : undefined,
      coachContext,
      mode,
      sourceText: typeof body.sourceText === "string" ? body.sourceText : undefined,
    });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coaches] bio-draft error:", message, err);
    res.status(502).json({
      error: "Bio assistant failed",
      detail: message,
    });
  }
});

// Create coach profile (POST for initial creation)
router.post("/me", authMiddleware(), async (req, res) => {
  try {
    const user = (req as { user?: { id: string } }).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { signupRole: true, athleteProfiles: { select: { id: true }, take: 1 } },
    });
    if (!dbUser) return res.status(404).json({ error: "User not found" });
    if (dbUser.signupRole === "athlete" || (dbUser.athleteProfiles?.length ?? 0) > 0) {
      return res.status(403).json({
        error: "You signed up as an athlete. Use a different account to create a coach profile.",
      });
    }

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

    const baseSlug = slugify(data.displayName);
    const inviteSlug = RESERVED_SLUGS.has(baseSlug) ? `coach-${baseSlug}` : await ensureUniqueInviteSlug(prisma, baseSlug);
    await prisma.coachInvite.create({
      data: { coachProfileId: profile.id, slug: inviteSlug },
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

    queueEmail("new_coach_signup", {
      coachName: data.displayName,
      sports: data.sports,
      cities: data.serviceCities,
    }).catch((err) => console.error("[coaches] queueEmail new_coach_signup failed:", err));

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

// Get or create invite link for the current coach (one per coach, friendly slug)
router.get("/me/invites", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    include: { invite: true },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  if (!profile.invite) {
    const baseSlug = slugify(profile.displayName);
    const slug = RESERVED_SLUGS.has(baseSlug) ? `coach-${baseSlug}` : await ensureUniqueInviteSlug(prisma, baseSlug);
    const invite = await prisma.coachInvite.create({
      data: { coachProfileId: profile.id, slug },
    });
    const appUrl = process.env.APP_URL || "http://localhost:5173";
    return res.json({ slug: invite.slug, url: `${appUrl}/coaches/${invite.slug}` });
  }

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  res.json({ slug: profile.invite.slug, url: `${appUrl}/coaches/${profile.invite.slug}` });
});

// Update invite slug (coach can customize their link)
router.patch("/me/invites", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const raw = (req.body as { slug?: string }).slug;
  const slug = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 50) : "";
  if (!slug || slug.length < 2) return res.status(400).json({ error: "slug must be at least 2 characters (letters, numbers, hyphens only)" });
  if (RESERVED_SLUGS.has(slug)) return res.status(400).json({ error: "This slug is reserved" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    include: { invite: true },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  if (!profile.invite) return res.status(404).json({ error: "Invite not found; try refreshing" });

  const existing = await prisma.coachInvite.findFirst({
    where: { slug, coachProfileId: { not: profile.id } },
  });
  if (existing) return res.status(409).json({ error: "This link name is already taken" });

  await prisma.coachInvite.update({
    where: { id: profile.invite.id },
    data: { slug },
  });
  const appUrl = process.env.APP_URL || "http://localhost:5173";
  res.json({ slug, url: `${appUrl}/coaches/${slug}` });
});

// List connected athletes (invite-link signups).
// CoachAthlete rows are only removed by DB CASCADE (coach or athlete profile deleted); no app code deletes them.
router.get("/me/athletes", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const coachAthletes = await prisma.coachAthlete.findMany({
    where: { coachProfileId: profile.id },
    include: { athlete: true },
    orderBy: { createdAt: "desc" },
  });

  res.json(
    coachAthletes.map((ca) => ({
      athleteProfileId: ca.athleteProfileId,
      status: ca.status,
      createdAt: ca.createdAt.toISOString(),
      athlete: {
        id: ca.athlete.id,
        displayName: ca.athlete.displayName,
        sports: ca.athlete.sports,
        serviceCity: ca.athlete.serviceCity,
        userId: ca.athlete.userId,
      },
    }))
  );
});

// Single athlete detail with booking history (for coach view)
router.get("/me/athletes/:athleteProfileId", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const { athleteProfileId } = req.params;

  const athleteProfile = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
  });
  if (!athleteProfile) return res.status(404).json({ error: "Athlete not found" });

  const connection = await prisma.coachAthlete.findUnique({
    where: {
      coachProfileId_athleteProfileId: {
        coachProfileId: profile.id,
        athleteProfileId,
      },
    },
  });

  const bookings = await prisma.booking.findMany({
    where: { coachId: profile.id, athleteProfileId },
    include: {
      slot: { include: { location: true } },
      review: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!connection && bookings.length === 0) {
    return res.status(404).json({ error: "No relationship with this athlete" });
  }

  const completedBookings = bookings.filter((b) => b.status === "completed");
  const totalRevenue = completedBookings.reduce(
    (sum, b) => sum + (b.paymentStatus === "succeeded" ? (b.amountCents ?? 0) : 0),
    0
  );

  res.json({
    athlete: {
      id: athleteProfile.id,
      userId: athleteProfile.userId,
      displayName: athleteProfile.displayName,
      sports: athleteProfile.sports,
      serviceCity: athleteProfile.serviceCity,
      level: athleteProfile.level,
      birthYear: athleteProfile.birthYear,
      phone: athleteProfile.phone,
    },
    connection: connection
      ? { status: connection.status, createdAt: connection.createdAt.toISOString() }
      : null,
    bookings: bookings.map((b) => ({
      id: b.id,
      slot: {
        startTime: b.slot.startTime.toISOString(),
        endTime: b.slot.endTime.toISOString(),
        location: b.slot.location
          ? { name: b.slot.location.name, address: b.slot.location.address, notes: b.slot.location.notes ?? null }
          : null,
      },
      message: b.message ?? null,
      status: b.status,
      amountCents: b.amountCents ?? null,
      paymentStatus: b.paymentStatus ?? null,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      coachRecap: b.coachRecap ?? null,
      review: b.review
        ? { rating: b.review.rating, comment: b.review.comment, createdAt: b.review.createdAt.toISOString() }
        : null,
    })),
    stats: {
      totalSessions: bookings.length,
      completedSessions: completedBookings.length,
      totalRevenue,
    },
  });
});

// ---------------------------------------------------------------------------
// Athlete invites (Version A+: invite by email; appears as a pending row until
// the invitee signs up via /claim/:token, at which point a real CoachAthlete is
// created and this row is marked promoted).
// ---------------------------------------------------------------------------

const RESEND_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const INVITE_NAME_MAX = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

function buildClaimUrl(token: string): string {
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${appUrl}/claim/${token}`;
}

// List this coach's pending athlete invites (most recent first)
router.get("/me/athlete-invites", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const invites = await prisma.coachAthleteInvite.findMany({
    where: { coachProfileId: profile.id, status: "invited" },
    orderBy: { invitedAt: "desc" },
  });

  res.json(
    invites.map((i) => ({
      id: i.id,
      athleteEmail: i.athleteEmail,
      athleteName: i.athleteName,
      parentName: i.parentName,
      invitedAt: i.invitedAt.toISOString(),
      lastSentAt: i.lastSentAt.toISOString(),
    })),
  );
});

// Create or revive an invite. If an active invite already exists for this
// (coach, email), this acts as a resend (new email, bump lastSentAt) and the
// 200 response includes the existing row.
router.post("/me/athlete-invites", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = (req.body ?? {}) as {
    athleteEmail?: string;
    athleteName?: string;
    parentName?: string | null;
  };

  const email = typeof body.athleteEmail === "string" ? body.athleteEmail.trim().toLowerCase() : "";
  const athleteName = typeof body.athleteName === "string" ? body.athleteName.trim() : "";
  const parentName =
    typeof body.parentName === "string" && body.parentName.trim()
      ? body.parentName.trim().slice(0, INVITE_NAME_MAX)
      : null;

  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }
  if (!athleteName) return res.status(400).json({ error: "Athlete name is required" });
  if (athleteName.length > INVITE_NAME_MAX) {
    return res.status(400).json({ error: `Athlete name must be ${INVITE_NAME_MAX} characters or fewer` });
  }

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
    include: { user: { select: { email: true } } },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  if (profile.user.email && profile.user.email.trim().toLowerCase() === email) {
    return res.status(400).json({ error: "You can't invite yourself" });
  }

  // Reject if this email already belongs to a connected athlete for this coach.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      athleteProfiles: { select: { id: true }, take: 1 },
    },
  });
  if (existingUser?.athleteProfiles.length) {
    const athleteProfileId = existingUser.athleteProfiles[0].id;
    const existingLink = await prisma.coachAthlete.findUnique({
      where: {
        coachProfileId_athleteProfileId: {
          coachProfileId: profile.id,
          athleteProfileId,
        },
      },
    });
    if (existingLink) {
      return res
        .status(409)
        .json({ error: "This athlete is already connected to you", code: "ALREADY_CONNECTED" });
    }
  }

  // Upsert: same (coach, email) → revive/refresh. Generate a fresh token so
  // cancelled/promoted rows don't leak old links.
  const token = generateInviteToken();
  const now = new Date();
  const invite = await prisma.coachAthleteInvite.upsert({
    where: {
      coachProfileId_athleteEmail: {
        coachProfileId: profile.id,
        athleteEmail: email,
      },
    },
    update: {
      athleteName,
      parentName,
      status: "invited",
      lastSentAt: now,
      promotedAt: null,
      promotedToCoachAthleteId: null,
      token,
    },
    create: {
      coachProfileId: profile.id,
      athleteEmail: email,
      athleteName,
      parentName,
      token,
    },
  });

  void queueEmail("coach_invite_athlete", {
    athleteEmail: invite.athleteEmail,
    athleteName: invite.athleteName,
    parentName: invite.parentName,
    coachDisplayName: profile.displayName,
    claimUrl: buildClaimUrl(invite.token),
  });

  res.status(201).json({
    id: invite.id,
    athleteEmail: invite.athleteEmail,
    athleteName: invite.athleteName,
    parentName: invite.parentName,
    invitedAt: invite.invitedAt.toISOString(),
    lastSentAt: invite.lastSentAt.toISOString(),
  });
});

// Resend an invite email (rate-limited to once per 5 minutes per invite)
router.post("/me/athlete-invites/:id/resend", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const invite = await prisma.coachAthleteInvite.findUnique({ where: { id: req.params.id } });
  if (!invite || invite.coachProfileId !== profile.id) {
    return res.status(404).json({ error: "Invite not found" });
  }
  if (invite.status !== "invited") {
    return res.status(409).json({ error: "This invite is no longer active" });
  }

  const sinceLast = Date.now() - invite.lastSentAt.getTime();
  if (sinceLast < RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - sinceLast) / 1000);
    return res
      .status(429)
      .json({ error: `Please wait ${waitSeconds}s before resending`, retryAfterSeconds: waitSeconds });
  }

  const updated = await prisma.coachAthleteInvite.update({
    where: { id: invite.id },
    data: { lastSentAt: new Date() },
  });

  void queueEmail("coach_invite_athlete", {
    athleteEmail: updated.athleteEmail,
    athleteName: updated.athleteName,
    parentName: updated.parentName,
    coachDisplayName: profile.displayName,
    claimUrl: buildClaimUrl(updated.token),
  });

  res.json({
    id: updated.id,
    lastSentAt: updated.lastSentAt.toISOString(),
  });
});

// Cancel an invite (soft delete; preserves the unique constraint and audit trail)
router.delete("/me/athlete-invites/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const invite = await prisma.coachAthleteInvite.findUnique({ where: { id: req.params.id } });
  if (!invite || invite.coachProfileId !== profile.id) {
    return res.status(404).json({ error: "Invite not found" });
  }

  await prisma.coachAthleteInvite.update({
    where: { id: invite.id },
    data: { status: "cancelled" },
  });

  res.status(204).end();
});

// Coach locations CRUD
router.get("/me/locations", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const locations = await prisma.coachLocation.findMany({
    where: { coachId: profile.id },
    orderBy: { name: "asc" },
  });
  res.json(
    locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      notes: loc.notes ?? null,
      latitude: loc.latitude != null ? Number(loc.latitude) : null,
      longitude: loc.longitude != null ? Number(loc.longitude) : null,
    }))
  );
});

router.post("/me/locations", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const parsed = coachLocationCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { name, address, notes, latitude, longitude } = parsed.data;
  const location = await prisma.coachLocation.create({
    data: {
      coachId: profile.id,
      name,
      address,
      notes: notes ?? null,
      latitude: latitude != null ? latitude : null,
      longitude: longitude != null ? longitude : null,
    },
  });
  res.status(201).json({
    id: location.id,
    name: location.name,
    address: location.address,
    notes: location.notes ?? null,
    latitude: location.latitude != null ? Number(location.latitude) : null,
    longitude: location.longitude != null ? Number(location.longitude) : null,
  });
});

router.put("/me/locations/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const existing = await prisma.coachLocation.findFirst({
    where: { id: req.params.id, coachId: profile.id },
  });
  if (!existing) return res.status(404).json({ error: "Location not found" });
  const parsed = coachLocationUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const location = await prisma.coachLocation.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.address !== undefined && { address: parsed.data.address }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes ?? null }),
      ...(parsed.data.latitude !== undefined && { latitude: parsed.data.latitude }),
      ...(parsed.data.longitude !== undefined && { longitude: parsed.data.longitude }),
    },
  });
  res.json({
    id: location.id,
    name: location.name,
    address: location.address,
    notes: location.notes ?? null,
    latitude: location.latitude != null ? Number(location.latitude) : null,
    longitude: location.longitude != null ? Number(location.longitude) : null,
  });
});

router.delete("/me/locations/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const existing = await prisma.coachLocation.findFirst({
    where: { id: req.params.id, coachId: profile.id },
  });
  if (!existing) return res.status(404).json({ error: "Location not found" });
  await prisma.coachLocation.delete({ where: { id: existing.id } });
  return res.status(204).send();
});

// Service areas CRUD
router.get("/me/service-areas", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const areas = await prisma.serviceArea.findMany({
    where: { coachProfileId: profile.id },
    orderBy: { label: "asc" },
  });
  res.json(areas.map((a) => ({
    id: a.id,
    label: a.label,
    latitude: Number(a.latitude),
    longitude: Number(a.longitude),
    radiusMiles: a.radiusMiles,
  })));
});

router.post("/me/service-areas", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const parsed = serviceAreaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { label, latitude, longitude, radiusMiles } = parsed.data;
  const area = await prisma.serviceArea.create({
    data: {
      label,
      latitude: new Prisma.Decimal(latitude),
      longitude: new Prisma.Decimal(longitude),
      radiusMiles,
      coachProfileId: profile.id,
    },
  });
  res.status(201).json({
    id: area.id,
    label: area.label,
    latitude: Number(area.latitude),
    longitude: Number(area.longitude),
    radiusMiles: area.radiusMiles,
  });
});

router.put("/me/service-areas/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const existing = await prisma.serviceArea.findFirst({ where: { id: req.params.id, coachProfileId: profile.id } });
  if (!existing) return res.status(404).json({ error: "Service area not found" });
  const parsed = serviceAreaUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { label, latitude, longitude, radiusMiles } = parsed.data;
  const updated = await prisma.serviceArea.update({
    where: { id: existing.id },
    data: {
      ...(label != null && { label }),
      ...(latitude != null && { latitude: new Prisma.Decimal(latitude) }),
      ...(longitude != null && { longitude: new Prisma.Decimal(longitude) }),
      ...(radiusMiles != null && { radiusMiles }),
    },
  });
  res.json({
    id: updated.id,
    label: updated.label,
    latitude: Number(updated.latitude),
    longitude: Number(updated.longitude),
    radiusMiles: updated.radiusMiles,
  });
});

router.delete("/me/service-areas/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });
  const existing = await prisma.serviceArea.findFirst({ where: { id: req.params.id, coachProfileId: profile.id } });
  if (!existing) return res.status(404).json({ error: "Service area not found" });
  await prisma.serviceArea.delete({ where: { id: existing.id } });
  res.status(204).send();
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
        location: { select: { id: true, name: true } },
        slots: {
          include: {
            bookings: {
              where: { status: { not: "cancelled" } },
              select: { id: true, status: true },
            },
          },
        },
      },
      orderBy: { firstStartTime: "asc" },
    }),
    prisma.availabilitySlot.findMany({
      where: { coachId: profile.id, ruleId: null },
      include: {
        location: { select: { id: true, name: true } },
        bookings: {
          where: { status: { not: "cancelled" } },
          select: { id: true, status: true },
        },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  // Two parallel sets so the calendar can color slots semantically:
  //   bookedSlotIds  -> at least one confirmed/completed booking (green chip)
  //   pendingSlotIds -> ONLY pending bookings, none confirmed yet (amber chip,
  //                     "needs your action")
  // A slot with both confirmed + pending counts as booked (green) so the coach
  // doesn't lose the "this is on" signal; the pending request still surfaces
  // in their bookings list / session detail page.
  const bookedSlotIds: string[] = [];
  const pendingSlotIds: string[] = [];
  const isBooked = (bookings: { status: string }[]) =>
    bookings.some((b) => b.status === "confirmed" || b.status === "completed");
  const isPendingOnly = (bookings: { status: string }[]) =>
    bookings.length > 0 && bookings.every((b) => b.status === "pending");
  for (const r of rules) {
    for (const s of r.slots) {
      if (isBooked(s.bookings)) bookedSlotIds.push(s.id);
      else if (isPendingOnly(s.bookings)) pendingSlotIds.push(s.id);
    }
  }
  for (const s of oneOffSlots) {
    if (isBooked(s.bookings)) bookedSlotIds.push(s.id);
    else if (isPendingOnly(s.bookings)) pendingSlotIds.push(s.id);
  }

  res.json({
    rules: rules.map((r) => ({
      id: r.id,
      firstStartTime: r.firstStartTime.toISOString(),
      durationMinutes: r.durationMinutes,
      recurrence: r.recurrence,
      endDate: r.endDate.toISOString().slice(0, 10),
      slotCount: r._count.slots,
      bookingCount: r.slots.reduce((sum, s) => sum + s.bookings.length, 0),
      locationId: r.locationId ?? undefined,
      location: r.location ? { id: r.location.id, name: r.location.name } : null,
      maxCapacity: r.maxCapacity,
      slots: r.slots.map((s) => ({
        id: s.id,
        startTime: s.startTime.toISOString(),
      })),
    })),
    oneOffSlots: oneOffSlots.map((s) => ({
      id: s.id,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime.toISOString(),
      status: s.status,
      locationId: s.locationId ?? undefined,
      location: s.location ? { id: s.location.id, name: s.location.name } : null,
      maxCapacity: s.maxCapacity,
      allowPrivate: s.allowPrivate,
    })),
    bookedSlotIds,
    pendingSlotIds,
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
  const { startTime, durationMinutes, recurrence, locationId } = parsed.data;
  const maxCapacity = (req.body as { maxCapacity?: number }).maxCapacity ?? 1;
  const allowPrivate = (req.body as { allowPrivate?: boolean }).allowPrivate !== false;
  if (recurrence !== "none") {
    return res.status(400).json({
      error: "Use POST /me/availability/rules for recurring availability.",
    });
  }
  if (locationId) {
    const loc = await prisma.coachLocation.findFirst({
      where: { id: locationId, coachId: profile.id },
    });
    if (!loc) return res.status(400).json({ error: "Location not found or not yours." });
  }

  const clampedCapacity = Math.max(1, Math.min(20, maxCapacity));
  const grErrSlot = groupRatesRequiredResponse(clampedCapacity, profile);
  if (grErrSlot) return res.status(grErrSlot.status).json(grErrSlot.body);

  const firstStart = new Date(startTime);
  const durationMs = durationMinutes * 60 * 1000;
  const firstEnd = new Date(firstStart.getTime() + durationMs);

  const slot = await prisma.availabilitySlot.create({
    data: {
      coachId: profile.id,
      locationId: locationId ?? null,
      startTime: firstStart,
      endTime: firstEnd,
      recurrence: "none",
      maxCapacity: clampedCapacity,
      allowPrivate,
    },
  });
  return res.status(201).json({
    id: slot.id,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    status: slot.status,
    maxCapacity: slot.maxCapacity,
    allowPrivate: slot.allowPrivate,
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
  const { firstStartTime, durationMinutes, endDate, locationId } = parsed.data;
  const maxCapacity = (req.body as { maxCapacity?: number }).maxCapacity ?? 1;
  if (locationId) {
    const loc = await prisma.coachLocation.findFirst({
      where: { id: locationId, coachId: profile.id },
    });
    if (!loc) return res.status(400).json({ error: "Location not found or not yours." });
  }
  const firstStart = new Date(firstStartTime);
  const endDateObj = new Date(endDate + "T23:59:59.999Z");
  const durationMs = durationMinutes * 60 * 1000;
  const maxEnd = new Date(firstStart.getTime() + MAX_RULE_SPAN_MS);
  const cap = endDateObj > maxEnd ? maxEnd : endDateObj;
  const clampedCapacity = Math.max(1, Math.min(20, maxCapacity));
  const grErrRule = groupRatesRequiredResponse(clampedCapacity, profile);
  if (grErrRule) return res.status(grErrRule.status).json(grErrRule.body);

  const rule = await prisma.availabilityRule.create({
    data: {
      coachId: profile.id,
      locationId: locationId ?? null,
      firstStartTime: firstStart,
      durationMinutes,
      recurrence: "weekly",
      endDate: cap,
      maxCapacity: clampedCapacity,
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
      locationId: locationId ?? null,
      startTime: start,
      endTime: end,
      recurrence: "weekly",
      maxCapacity: clampedCapacity,
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
    maxCapacity: clampedCapacity,
  });
});

// Batch create one-off slots in a single transaction.
router.post("/me/availability/batch", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const body = req.body as { slots?: { startTime: string; durationMinutes: number; locationId?: string; maxCapacity?: number; allowPrivate?: boolean }[] };
  if (!Array.isArray(body.slots) || body.slots.length === 0) {
    return res.status(400).json({ error: "slots array is required" });
  }
  if (body.slots.length > 50) {
    return res.status(400).json({ error: "Maximum 50 slots per batch" });
  }

  const locationId = body.slots[0]?.locationId ?? null;
  if (locationId) {
    const loc = await prisma.coachLocation.findFirst({ where: { id: locationId, coachId: profile.id } });
    if (!loc) return res.status(400).json({ error: "Location not found or not yours." });
  }

  const data = body.slots.map((s) => {
    const start = new Date(s.startTime);
    const end = new Date(start.getTime() + s.durationMinutes * 60 * 1000);
    return {
      coachId: profile.id,
      locationId: s.locationId ?? null,
      startTime: start,
      endTime: end,
      recurrence: "none" as const,
      maxCapacity: Math.max(1, Math.min(20, s.maxCapacity ?? 1)),
      allowPrivate: s.allowPrivate !== false,
    };
  });

  for (const row of data) {
    const grErrBatch = groupRatesRequiredResponse(row.maxCapacity, profile);
    if (grErrBatch) return res.status(grErrBatch.status).json(grErrBatch.body);
  }

  const result = await prisma.availabilitySlot.createMany({ data });
  return res.status(201).json({ created: result.count });
});

// Batch create recurring rules and their slots in a single transaction.
router.post("/me/availability/rules/batch", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const body = req.body as { rules?: { firstStartTime: string; durationMinutes: number; endDate: string; locationId?: string; maxCapacity?: number }[] };
  if (!Array.isArray(body.rules) || body.rules.length === 0) {
    return res.status(400).json({ error: "rules array is required" });
  }
  if (body.rules.length > 50) {
    return res.status(400).json({ error: "Maximum 50 rules per batch" });
  }

  const locationId = body.rules[0]?.locationId ?? null;
  if (locationId) {
    const loc = await prisma.coachLocation.findFirst({ where: { id: locationId, coachId: profile.id } });
    if (!loc) return res.status(400).json({ error: "Location not found or not yours." });
  }

  for (const r of body.rules!) {
    const clampedCapacityPre = Math.max(1, Math.min(20, r.maxCapacity ?? 1));
    const grErrRulesBatch = groupRatesRequiredResponse(clampedCapacityPre, profile);
    if (grErrRulesBatch) return res.status(grErrRulesBatch.status).json(grErrRulesBatch.body);
  }

  let totalSlots = 0;
  await prisma.$transaction(async (tx) => {
    for (const r of body.rules!) {
      const firstStart = new Date(r.firstStartTime);
      const endDateObj = new Date(r.endDate + "T23:59:59.999Z");
      const durationMs = r.durationMinutes * 60 * 1000;
      const maxEnd = new Date(firstStart.getTime() + MAX_RULE_SPAN_MS);
      const cap = endDateObj > maxEnd ? maxEnd : endDateObj;
      const clampedCapacity = Math.max(1, Math.min(20, r.maxCapacity ?? 1));

      const rule = await tx.availabilityRule.create({
        data: {
          coachId: profile.id,
          locationId: r.locationId ?? null,
          firstStartTime: firstStart,
          durationMinutes: r.durationMinutes,
          recurrence: "weekly",
          endDate: cap,
          maxCapacity: clampedCapacity,
        },
      });

      const slotTimes: { start: Date; end: Date }[] = [];
      let t = firstStart.getTime();
      while (t <= cap.getTime()) {
        slotTimes.push({ start: new Date(t), end: new Date(t + durationMs) });
        t += ONE_WEEK_MS;
      }

      await tx.availabilitySlot.createMany({
        data: slotTimes.map(({ start, end }) => ({
          coachId: profile.id,
          ruleId: rule.id,
          locationId: r.locationId ?? null,
          startTime: start,
          endTime: end,
          recurrence: "weekly",
          maxCapacity: clampedCapacity,
        })),
      });
      totalSlots += slotTimes.length;
    }
  });

  return res.status(201).json({ created: totalSlots });
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
              athleteProfile: { include: { user: { select: { email: true, name: true } } } },
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
    queueEmail("booking_status", {
      athleteEmail: b.athleteProfile.user.email,
      athleteName: b.athleteProfile.user.name ?? undefined,
      coachDisplayName: b.coach.displayName,
      newStatus: "cancelled",
      slotStart: b.slot.startTime.toISOString(),
      slotEnd: b.slot.endTime.toISOString(),
      bookingId: b.id,
    }).catch((err) => console.error("[coaches] cancel booking email failed:", err));
  }

  await prisma.availabilityRule.delete({
    where: { id: rule.id },
  });
  return res.status(204).send();
});

// Delete a single slot. Cancels non-cancelled bookings and emails athletes, then deletes slot.
router.patch("/me/availability/:id", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile) return res.status(404).json({ error: "Coach profile not found" });

  const slot = await prisma.availabilitySlot.findFirst({
    where: { id: req.params.id, coachId: profile.id },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });

  const body = req.body as {
    startTime?: string;
    durationMinutes?: number;
    locationId?: string | null;
    maxCapacity?: number;
    allowPrivate?: boolean;
  };

  const data: Record<string, unknown> = {};

  if (body.startTime) {
    const newStart = new Date(body.startTime);
    if (isNaN(newStart.getTime())) return res.status(400).json({ error: "Invalid startTime" });
    const duration = body.durationMinutes ?? Math.round((slot.endTime.getTime() - slot.startTime.getTime()) / 60000);
    data.startTime = newStart;
    data.endTime = new Date(newStart.getTime() + duration * 60000);
  } else if (body.durationMinutes) {
    const start = slot.startTime;
    data.endTime = new Date(start.getTime() + body.durationMinutes * 60000);
  }

  if (body.locationId !== undefined) {
    if (body.locationId) {
      const loc = await prisma.coachLocation.findFirst({ where: { id: body.locationId, coachId: profile.id } });
      if (!loc) return res.status(400).json({ error: "Location not found or not yours." });
      data.locationId = body.locationId;
    } else {
      data.locationId = null;
    }
  }

  if (body.maxCapacity !== undefined) {
    data.maxCapacity = Math.max(1, Math.min(20, body.maxCapacity));
  }

  if (body.allowPrivate !== undefined) {
    data.allowPrivate = body.allowPrivate;
  }

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const effectiveMaxCapacity =
    body.maxCapacity !== undefined
      ? Math.max(1, Math.min(20, body.maxCapacity))
      : slot.maxCapacity;
  const grErrPatch = groupRatesRequiredResponse(effectiveMaxCapacity, profile);
  if (grErrPatch) return res.status(grErrPatch.status).json(grErrPatch.body);

  const updated = await prisma.availabilitySlot.update({
    where: { id: req.params.id },
    data,
    include: { location: { select: { id: true, name: true } } },
  });

  return res.json({
    id: updated.id,
    startTime: updated.startTime.toISOString(),
    endTime: updated.endTime.toISOString(),
    status: updated.status,
    maxCapacity: updated.maxCapacity,
    allowPrivate: updated.allowPrivate,
    locationId: updated.locationId,
    location: updated.location,
  });
});

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
          athleteProfile: { include: { user: { select: { email: true, name: true } } } },
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
    queueEmail("booking_status", {
      athleteEmail: b.athleteProfile.user.email,
      athleteName: b.athleteProfile.user.name ?? undefined,
      coachDisplayName: b.coach.displayName,
      newStatus: "cancelled",
      slotStart: b.slot.startTime.toISOString(),
      slotEnd: b.slot.endTime.toISOString(),
      bookingId: b.id,
    }).catch((err) => console.error("[coaches] cancel booking email failed:", err));
  }

  await prisma.availabilitySlot.deleteMany({
    where: { id: req.params.id, coachId: profile.id },
  });
  return res.status(204).send();
});

// Haversine distance in miles between two lat/lng points
function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Public: list coaches (filtered, search, paginated, sorted)
// Supports both legacy ?city= and new ?lat=&lng=&radius= params
const VALID_SORTS = ["best_match", "rating", "reviews", "price_asc", "price_desc", "distance"] as const;
type SortOption = (typeof VALID_SORTS)[number];

router.get("/", async (req, res) => {
  const sport = (req.query.sport as string | undefined)?.trim();
  const city = (req.query.city as string | undefined)?.trim();
  const q = (req.query.q as string | undefined)?.trim();
  const searchLat = req.query.lat ? parseFloat(String(req.query.lat)) : null;
  const searchLng = req.query.lng ? parseFloat(String(req.query.lng)) : null;
  const searchRadius = req.query.radius ? parseInt(String(req.query.radius), 10) : 25;
  const sortRaw = (req.query.sort as string | undefined)?.trim() as SortOption | undefined;
  const sort: SortOption = sortRaw && VALID_SORTS.includes(sortRaw) ? sortRaw : "best_match";
  const pageRaw = req.query.page;
  const limitRaw = req.query.limit;
  const page = Math.max(1, parseInt(String(pageRaw), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(String(limitRaw), 10) || 12));

  const useGeoSearch = searchLat != null && searchLng != null && Number.isFinite(searchLat) && Number.isFinite(searchLng);

  if (useGeoSearch) {
    // Distance-based search using service_areas
    const sportCondition = sport ? `AND cp.sports @> ARRAY[$3]::text[]` : "";
    const qCondition = q ? `AND (cp.display_name ILIKE $${sport ? 4 : 3} OR cp.bio ILIKE $${sport ? 4 : 3})` : "";

    const params: (number | string)[] = [searchLat!, searchLng!];
    if (sport) params.push(sport);
    if (q) params.push(`%${q}%`);

    const coachIdsResult = await prisma.$queryRawUnsafe<{ coach_profile_id: string; min_distance: number }[]>(`
      SELECT sa.coach_profile_id, MIN(
        3959 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(sa.latitude))
            * cos(radians(sa.longitude) - radians($2))
            + sin(radians($1)) * sin(radians(sa.latitude))
          ))
        )
      ) AS min_distance
      FROM service_areas sa
      JOIN coach_profiles cp ON cp.id = sa.coach_profile_id
      WHERE sa.coach_profile_id IS NOT NULL
        AND cp.verified = true
        ${sportCondition}
        ${qCondition}
      GROUP BY sa.coach_profile_id
      HAVING MIN(
        3959 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians($1)) * cos(radians(sa.latitude))
            * cos(radians(sa.longitude) - radians($2))
            + sin(radians($1)) * sin(radians(sa.latitude))
          ))
        )
      ) <= ${searchRadius}
      ORDER BY min_distance ASC
    `, ...params);

    const totalGeo = coachIdsResult.length;
    const distanceMap = new Map(coachIdsResult.map((r) => [r.coach_profile_id, r.min_distance]));
    const allMatchingIds = coachIdsResult.map((r) => r.coach_profile_id);

    const coaches = allMatchingIds.length > 0 ? await prisma.coachProfile.findMany({
      where: { id: { in: allMatchingIds } },
      include: {
        photos: { orderBy: { sortOrder: "asc" } },
        serviceAreas: true,
        _count: { select: { reviews: true } },
        reviews: { select: { rating: true } },
      },
    }) : [];

    const allWithRating = coaches.map((c) => {
      const avg = c.reviews.length > 0 ? c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length : null;
      return {
        id: c.id,
        displayName: c.displayName,
        sports: c.sports,
        serviceCities: c.serviceCities,
        serviceAreas: c.serviceAreas.map((a) => ({ id: a.id, label: a.label, latitude: Number(a.latitude), longitude: Number(a.longitude), radiusMiles: a.radiusMiles })),
        bio: c.bio,
        hourlyRate: c.hourlyRate?.toString(),
        verified: c.verified,
        avatarUrl: c.avatarUrl,
        photos: c.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
        credentials: parseCredentials(c.credentials),
        reviewCount: c._count.reviews,
        averageRating: avg ? Math.round(avg * 10) / 10 : null,
        distanceMiles: Math.round((distanceMap.get(c.id) ?? 0) * 10) / 10,
      };
    });

    if (sort === "rating") {
      allWithRating.sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
    } else if (sort === "reviews") {
      allWithRating.sort((a, b) => b.reviewCount - a.reviewCount);
    } else if (sort === "price_asc") {
      allWithRating.sort((a, b) => parseFloat(a.hourlyRate ?? "999999") - parseFloat(b.hourlyRate ?? "999999"));
    } else if (sort === "price_desc") {
      allWithRating.sort((a, b) => parseFloat(b.hourlyRate ?? "0") - parseFloat(a.hourlyRate ?? "0"));
    } else {
      allWithRating.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
    }

    const paged = allWithRating.slice((page - 1) * limit, page * limit);
    return res.json({ coaches: paged, total: totalGeo, page, limit });
  }

  // Legacy city-based or unfiltered search
  const conditions: Prisma.CoachProfileWhereInput[] = [{ verified: true }];
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
  const where: Prisma.CoachProfileWhereInput = { AND: conditions };

  const coaches = await prisma.coachProfile.findMany({
    where,
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      serviceAreas: true,
      _count: { select: { reviews: true } },
      reviews: { select: { rating: true } },
    },
  });
  const total = coaches.length;

  const allWithRating = coaches.map((c) => {
    const avg =
      c.reviews.length > 0
        ? c.reviews.reduce((s, r) => s + r.rating, 0) / c.reviews.length
        : null;
    return {
      id: c.id,
      displayName: c.displayName,
      sports: c.sports,
      serviceCities: c.serviceCities,
      serviceAreas: c.serviceAreas.map((a) => ({ id: a.id, label: a.label, latitude: Number(a.latitude), longitude: Number(a.longitude), radiusMiles: a.radiusMiles })),
      bio: c.bio,
      hourlyRate: c.hourlyRate?.toString(),
      verified: c.verified,
      avatarUrl: c.avatarUrl,
      photos: c.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
      credentials: parseCredentials(c.credentials),
      reviewCount: c._count.reviews,
      averageRating: avg ? Math.round(avg * 10) / 10 : null,
    };
  });

  if (sort === "rating") {
    allWithRating.sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0));
  } else if (sort === "reviews") {
    allWithRating.sort((a, b) => b.reviewCount - a.reviewCount);
  } else if (sort === "price_asc") {
    allWithRating.sort((a, b) => parseFloat(a.hourlyRate ?? "999999") - parseFloat(b.hourlyRate ?? "999999"));
  } else if (sort === "price_desc") {
    allWithRating.sort((a, b) => parseFloat(b.hourlyRate ?? "0") - parseFloat(a.hourlyRate ?? "0"));
  } else {
    allWithRating.sort((a, b) => b.reviewCount - a.reviewCount || a.displayName.localeCompare(b.displayName));
  }

  const paged = allWithRating.slice((page - 1) * limit, page * limit);
  res.json({ coaches: paged, total, page, limit });
});

// Resolve coach profile id from UUID or invite slug (used by public profile and contact)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function resolveCoachId(idOrSlug: string): Promise<string | null> {
  if (UUID_REGEX.test(idOrSlug)) return idOrSlug;
  const invite = await prisma.coachInvite.findUnique({
    where: { slug: idOrSlug },
    select: { coachProfileId: true },
  });
  return invite?.coachProfileId ?? null;
}

// Athlete-facing: send a message to a coach (no booking). Emails the coach.
router.post("/:coachId/contact", authMiddleware(), async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { athleteProfiles: { take: 1 } },
  });
  if (!dbUser) return res.status(404).json({ error: "User not found" });
  const athleteProfile = dbUser.athleteProfiles[0];
  if (!athleteProfile) return res.status(403).json({ error: "Athlete profile required to message a coach" });

  const coachIdParam = req.params.coachId;
  if (!coachIdParam) return res.status(400).json({ error: "Coach id is required" });
  const coachId = await resolveCoachId(coachIdParam);
  if (!coachId) return res.status(404).json({ error: "Coach not found" });

  const coach = await prisma.coachProfile.findUnique({
    where: { id: coachId },
    include: { user: { select: { email: true } } },
  });
  if (!coach) return res.status(404).json({ error: "Coach not found" });
  const coachEmail = coach.user?.email;
  if (!coachEmail) return res.status(400).json({ error: "Coach has no email on file" });

  const body = req.body as { message?: string };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "message is required" });

  const athleteEmail = dbUser.email?.trim() || null;
  try {
    await queueEmail("athlete_message_to_coach", {
      coachEmail,
      athleteEmail,
      athleteDisplayName: athleteProfile.displayName ?? dbUser.name ?? "An athlete",
      message,
    });
    res.json({ sent: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[coaches] contact email error:", msg);
    res.status(500).json({ error: "Failed to send message", detail: msg });
  }
});

// Public: get coach by id or invite slug (friendly URL, same slug as invite link)
router.get("/:id", async (req, res) => {
  const idOrSlug = req.params.id;
  const coachId = await resolveCoachId(idOrSlug);
  if (!coachId) return res.status(404).json({ error: "Coach not found" });
  const coach = await prisma.coachProfile.findUnique({
    where: { id: coachId },
    include: {
      user: { select: { email: true } },
      photos: { orderBy: { sortOrder: "asc" } },
      locations: { orderBy: { name: "asc" } },
      serviceAreas: { orderBy: { label: "asc" } },
      // All future slots (available and booked) for public calendar
      availabilitySlots: {
        where: { startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        include: {
          location: true,
          bookings: {
            where: { status: { not: "cancelled" } },
            select: { id: true, status: true, lockedPrivate: true },
          },
        },
      },
      reviews: {
        include: { athleteProfile: { include: { user: { select: { name: true } } } } },
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
    userId: coach.userId,
    displayName: coach.displayName,
    // Expose coach email on public profile only in non-production for debugging
    ...(process.env.NODE_ENV !== "production" && coach.user?.email
      ? { email: coach.user.email }
      : {}),
    sports: coach.sports,
    serviceCities: coach.serviceCities,
    serviceAreas: coach.serviceAreas.map((a) => ({ id: a.id, label: a.label, latitude: Number(a.latitude), longitude: Number(a.longitude), radiusMiles: a.radiusMiles })),
    bio: coach.bio,
    hourlyRate: coach.hourlyRate?.toString(),
    groupRates: coach.groupRates ?? null,
    verified: coach.verified,
    avatarUrl: coach.avatarUrl,
    credentials: parseCredentials(coach.credentials),
    photos: coach.photos.map((p) => ({ id: p.id, url: p.url, sortOrder: p.sortOrder })),
    locations: coach.locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      notes: loc.notes ?? null,
      latitude: loc.latitude != null ? Number(loc.latitude) : null,
      longitude: loc.longitude != null ? Number(loc.longitude) : null,
    })),
    availabilitySlots: coach.availabilitySlots.map((s) => {
      const activeBookings = s.bookings.length; // all non-cancelled (pending + confirmed + completed)
      const confirmedOrCompleted = s.bookings.filter((b) => b.status === "confirmed" || b.status === "completed").length;
      const isLocked = s.bookings.some((b) => (b as { lockedPrivate?: boolean }).lockedPrivate === true);
      const spotsRemaining = isLocked ? 0 : s.maxCapacity - activeBookings;
      const hourlyRate = coach.hourlyRate ? Number(coach.hourlyRate) : 0;
      const groupRates = coach.groupRates as Record<string, number> | null;
      const currentHeadcount = activeBookings;
      const currentPerPersonRate = hourlyRate > 0
        ? (s.maxCapacity > 1
            ? interpolateRate(currentHeadcount || 1, groupRates, hourlyRate)
            : hourlyRate)
        : null;
      return {
        id: s.id,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        status: spotsRemaining <= 0 ? "booked" : "available",
        recurrence: s.recurrence ?? "none",
        maxCapacity: s.maxCapacity,
        allowPrivate: s.allowPrivate,
        spotsRemaining: Math.max(0, spotsRemaining),
        currentHeadcount,
        currentPerPersonRate,
        isLocked,
        location: s.location
          ? {
              id: s.location.id,
              name: s.location.name,
              address: s.location.address,
              notes: s.location.notes ?? null,
              latitude: s.location.latitude != null ? Number(s.location.latitude) : null,
              longitude: s.location.longitude != null ? Number(s.location.longitude) : null,
            }
          : null,
      };
    }),
    reviews: coach.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      athleteName: r.athleteProfile?.user?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    reviewCount: coach._count.reviews,
    averageRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
    paymentMode: "after_session",
  });
});

export default router;
