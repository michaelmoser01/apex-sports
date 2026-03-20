import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { sendBookingRequestedToCoach, sendBookingRequestSubmittedToAthlete, sendBookingStatusToAthlete, sendGroupInviteToAthlete, sendPriceDropNotification } from "../notifications.js";
import { bookingCreateSchema, bookingUpdateSchema, reviewSchema } from "@apex-sports/shared";
import {
  stripe,
  isStripeEnabled,
  getOrCreateStripeCustomerId,
  createPaymentIntentAuthOnly,
  createDeferredBookingPaymentIntent,
  capturePaymentIntent,
  transferToConnectAccount,
  cancelPaymentIntent,
} from "../stripe.js";
import { sendPaymentLinkToAthlete } from "../notifications.js";

const router = Router();
const auth = authMiddleware();

async function getAthleteProfileId(userId: string): Promise<string | null> {
  const profile = await prisma.athleteProfile.findFirst({ where: { userId }, select: { id: true } });
  return profile?.id ?? null;
}

function computeAmountCents(slot: { startTime: Date; endTime: Date }, hourlyRateDollars: number): number {
  const durationMs = slot.endTime.getTime() - slot.startTime.getTime();
  const hours = durationMs / (60 * 60 * 1000);
  return Math.max(50, Math.ceil(hours * hourlyRateDollars * 100)); // Stripe min 50 cents
}

function getPerPersonRate(
  groupSize: number,
  groupRates: Record<string, number> | null | undefined,
  hourlyRate: number,
): number {
  if (!groupRates || typeof groupRates !== "object") return hourlyRate;
  const exact = groupRates[String(groupSize)];
  if (typeof exact === "number" && exact > 0) return exact;

  // Interpolate between the nearest defined tiers
  const defined = Object.entries(groupRates)
    .map(([k, v]) => ({ size: parseInt(k), rate: v }))
    .filter((e) => !isNaN(e.size) && typeof e.rate === "number" && e.rate > 0)
    .sort((a, b) => a.size - b.size);
  if (defined.length === 0) return hourlyRate;

  // Below the smallest defined tier → use smallest tier's rate
  if (groupSize <= defined[0].size) return defined[0].rate;
  // Above the largest defined tier → use largest tier's rate
  if (groupSize >= defined[defined.length - 1].size) return defined[defined.length - 1].rate;

  // Find surrounding tiers and linearly interpolate
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

function computePerPersonAmountCents(
  slot: { startTime: Date; endTime: Date },
  groupSize: number,
  groupRates: Record<string, number> | null | undefined,
  hourlyRate: number,
): number {
  const perPersonRate = getPerPersonRate(groupSize, groupRates, hourlyRate);
  return computeAmountCents(slot, perPersonRate);
}

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// List own bookings
router.get("/", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const athleteProfileId = await getAthleteProfileId(user.id);

  const asAthlete = athleteProfileId
    ? await prisma.booking.findMany({
        where: { athleteProfileId },
        include: {
          coach: true,
          slot: {
            include: {
              location: true,
              bookings: {
                where: { status: { not: "cancelled" } },
                select: { id: true, status: true },
              },
            },
          },
          review: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  const asCoach = coachProfile
    ? await prisma.booking.findMany({
        where: { coachId: coachProfile.id },
        include: {
          athleteProfile: { include: { user: { select: { name: true, email: true } } } },
          slot: {
            include: {
              location: true,
              bookings: {
                where: { status: { not: "cancelled" } },
                select: { id: true, status: true },
              },
            },
          },
          review: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  res.json({
    asAthlete: asAthlete.map((b) => {
      const participantCount = b.slot.bookings.length;
      const isMultiSession = b.slot.maxCapacity > 1;
      return {
        id: b.id,
        coach: {
          id: b.coach.id,
          displayName: b.coach.displayName,
          sports: b.coach.sports,
        },
        slot: {
          id: b.slot.id,
          startTime: b.slot.startTime.toISOString(),
          endTime: b.slot.endTime.toISOString(),
          maxCapacity: b.slot.maxCapacity,
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
          ? { rating: b.review.rating, comment: b.review.comment }
          : null,
        lockedPrivate: b.lockedPrivate,
        sessionType: isMultiSession ? (b.lockedPrivate ? "private" : "group") : "private",
        participantCount: isMultiSession ? participantCount : undefined,
        spotsRemaining: isMultiSession ? Math.max(0, b.slot.maxCapacity - participantCount) : undefined,
      };
    }),
    asCoach: asCoach.map((b) => {
      const participantCount = b.slot.bookings.length;
      const isMultiSession = b.slot.maxCapacity > 1;
      return {
        id: b.id,
        athlete: {
          id: b.athleteProfile.id,
          name: b.athleteProfile.user.name,
          email: b.athleteProfile.user.email,
        },
        slot: {
          id: b.slot.id,
          startTime: b.slot.startTime.toISOString(),
          endTime: b.slot.endTime.toISOString(),
          maxCapacity: b.slot.maxCapacity,
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
        lockedPrivate: b.lockedPrivate,
        sessionType: isMultiSession ? (b.lockedPrivate ? "private" : "group") : "private",
        participantCount: isMultiSession ? participantCount : undefined,
        spotsRemaining: isMultiSession ? Math.max(0, b.slot.maxCapacity - participantCount) : undefined,
      };
    }),
  });
});

// Verify Stripe Checkout Session after booking payment (sync fallback when user returns from Stripe)
router.get("/verify-checkout-payment", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id.trim() : null;
  if (!sessionId || !stripe) {
    return res.status(400).json({ error: "session_id required and Stripe must be configured" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }
    const bookingId = session.metadata?.bookingId as string | undefined;
    if (!bookingId) {
      return res.status(400).json({ error: "Invalid session" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { athleteProfileId: true, athleteProfile: { select: { userId: true } }, stripePaymentIntentId: true, paymentStatus: true },
    });
    if (!booking || booking.athleteProfile.userId !== user.id) {
      return res.status(403).json({ error: "Not your booking" });
    }
    if (booking.stripePaymentIntentId !== sessionId) {
      return res.status(400).json({ error: "Session does not match booking" });
    }
    if (booking.paymentStatus === "succeeded") {
      return res.json({ paymentStatus: "succeeded" });
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { paymentStatus: "succeeded" },
    });
    res.json({ paymentStatus: "succeeded" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bookings] verify-checkout-payment error:", message);
    res.status(500).json({ error: "Failed to verify payment", detail: message });
  }
});

// Get single booking (athlete or coach of that booking)
router.get("/:id", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      coach: true,
      slot: { include: { location: true } },
      athleteProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
      review: true,
      groupMembers: {
        include: { athleteProfile: { include: { user: { select: { name: true } } } } },
      },
    },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const coachProfile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  const isAthlete = booking.athleteProfile.userId === user.id;
  const isCoach = coachProfile?.id === booking.coachId;
  if (!isAthlete && !isCoach) return res.status(403).json({ error: "Not your booking" });

  // Flexible session model: find all participants on this slot (not just group members)
  const slotParticipants = booking.slot.maxCapacity > 1
    ? await prisma.booking.findMany({
        where: { slotId: booking.slotId, status: { not: "cancelled" } },
        include: { athleteProfile: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const isSlotLocked = slotParticipants.some((p) => p.lockedPrivate) || booking.lockedPrivate;

  const isMultiPersonSession = slotParticipants.length > 1 || booking.slot.maxCapacity > 1;

  res.json({
    id: booking.id,
    viewerRole: isAthlete ? "athlete" : "coach",
    coach: {
      id: booking.coach.id,
      displayName: booking.coach.displayName,
      sports: booking.coach.sports,
      userId: booking.coach.userId,
      stripeOnboardingComplete: booking.coach.stripeOnboardingComplete,
    },
    slot: {
      id: booking.slot.id,
      startTime: booking.slot.startTime.toISOString(),
      endTime: booking.slot.endTime.toISOString(),
      maxCapacity: booking.slot.maxCapacity,
      location: booking.slot.location
        ? {
            name: booking.slot.location.name,
            address: booking.slot.location.address,
            notes: booking.slot.location.notes ?? null,
            latitude: booking.slot.location.latitude != null ? Number(booking.slot.location.latitude) : null,
            longitude: booking.slot.location.longitude != null ? Number(booking.slot.location.longitude) : null,
          }
        : null,
    },
    athlete: isCoach
      ? {
          id: booking.athleteProfile.id,
          name: booking.athleteProfile.user.name,
          email: booking.athleteProfile.user.email,
        }
      : undefined,
    message: booking.message ?? null,
    status: booking.status,
    amountCents: booking.amountCents ?? null,
    paymentStatus: booking.paymentStatus ?? null,
    createdAt: booking.createdAt.toISOString(),
    completedAt: booking.completedAt?.toISOString() ?? null,
    coachRecap: booking.coachRecap ?? null,
    review: booking.review
      ? {
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt.toISOString(),
        }
      : null,
    attended: booking.attended,
    lockedPrivate: booking.lockedPrivate,
    inviteCode: booking.inviteCode ?? null,
    // Flexible session: all participants on this slot
    slotParticipants: isMultiPersonSession
      ? slotParticipants.map((p) => ({
          id: p.id,
          athleteName: p.athleteProfile.user.name,
          displayName: p.athleteProfile.displayName,
          avatarUrl: p.athleteProfile.avatarUrl,
          status: p.status,
          attended: p.attended,
          paymentStatus: p.paymentStatus,
          amountCents: p.amountCents,
          isCurrentUser: isAthlete && p.id === booking.id,
        }))
      : undefined,
    spotsRemaining: isMultiPersonSession
      ? (isSlotLocked ? 0 : Math.max(0, booking.slot.maxCapacity - slotParticipants.length))
      : undefined,
  });
});

// Coach: generate AI-enhanced session recap draft (preview only, not saved)
router.post("/:id/recap-draft", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const rawText = (req.body as { rawText?: string }).rawText;
  if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
    return res.status(400).json({ error: "rawText is required" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { coach: true, slot: true, athleteProfile: { include: { user: { select: { name: true } } } } },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile || profile.id !== booking.coachId) {
    return res.status(403).json({ error: "Only the coach can write a recap" });
  }
  if (booking.status !== "completed") {
    return res.status(400).json({ error: "Session must be completed first" });
  }

  try {
    const { invokeRecapDraft } = await import("../bedrock.js");
    const slotStr = `${booking.slot.startTime.toLocaleString()} – ${booking.slot.endTime.toLocaleString()}`;
    const result = await invokeRecapDraft({
      rawText: rawText.trim(),
      coachName: booking.coach.displayName,
      athleteName: booking.athleteProfile.user.name ?? "the athlete",
      sport: booking.coach.sports?.[0],
      sessionTime: slotStr,
    });
    res.json({ recap: result.recap });
  } catch (err) {
    console.error("[bookings] recap-draft error:", err);
    const message = err instanceof Error ? err.message : "Failed to generate recap";
    res.status(502).json({ error: message });
  }
});

// Coach: save session recap
router.post("/:id/recap", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const recap = (req.body as { recap?: string }).recap;
  if (!recap || typeof recap !== "string" || !recap.trim()) {
    return res.status(400).json({ error: "recap is required" });
  }
  if (recap.length > 5000) {
    return res.status(400).json({ error: "Recap is too long (max 5000 characters)" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const profile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!profile || profile.id !== booking.coachId) {
    return res.status(403).json({ error: "Only the coach can write a recap" });
  }
  if (booking.status !== "completed") {
    return res.status(400).json({ error: "Session must be completed first" });
  }

  await prisma.booking.update({
    where: { id: req.params.id },
    data: { coachRecap: recap.trim() },
  });

  res.json({ coachRecap: recap.trim() });
});

// Athlete: pay for a deferred booking with an embedded card form (server-side confirm, no webhook dependency)
router.post("/:id/pay-now", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const paymentMethodId = (req.body as { paymentMethodId?: string }).paymentMethodId;
  if (!paymentMethodId || typeof paymentMethodId !== "string") {
    return res.status(400).json({ error: "paymentMethodId is required" });
  }

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { coach: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const payNowAthleteProfile = await prisma.athleteProfile.findUnique({
    where: { id: booking.athleteProfileId },
    select: { userId: true },
  });
  if (!payNowAthleteProfile || payNowAthleteProfile.userId !== user.id) return res.status(403).json({ error: "Not your booking" });
  if (booking.paymentStatus === "succeeded") {
    return res.json({ paymentStatus: "succeeded" });
  }
  if (!["deferred", "payment_link_sent"].includes(booking.paymentStatus ?? "")) {
    return res.status(400).json({ error: `Payment not needed (status: ${booking.paymentStatus ?? "none"})` });
  }
  if (!booking.amountCents || !booking.coach.stripeConnectAccountId || !stripe) {
    return res.status(400).json({ error: "Payment not configured for this booking" });
  }

  const athleteUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true, email: true },
  });
  if (!athleteUser) return res.status(400).json({ error: "Athlete not found" });

  const customerId = await getOrCreateStripeCustomerId(
    stripe,
    user.id,
    athleteUser.email ?? "",
    athleteUser.stripeCustomerId
  );
  if (!athleteUser.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  try {
    const { clientSecret, paymentIntentId, status } = await createDeferredBookingPaymentIntent({
      amountCents: booking.amountCents,
      currency: booking.currency ?? "usd",
      customerId,
      connectAccountId: booking.coach.stripeConnectAccountId,
      bookingId: booking.id,
      idempotencyKey: `deferred-${booking.id}-${Date.now()}`,
      paymentMethodId,
    });

    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripePaymentIntentId: paymentIntentId },
    });

    if (status === "succeeded") {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: "succeeded" },
      });
      return res.json({ paymentStatus: "succeeded" });
    }

    if (status === "requires_action") {
      return res.json({ requiresAction: true, clientSecret, paymentIntentId });
    }

    return res.status(400).json({ error: `Unexpected payment status: ${status}` });
  } catch (err) {
    console.error("[bookings] pay-now error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: "Payment failed. Please try again.", detail: message });
  }
});

// Finalize payment after 3DS verification (client calls this after handleCardAction)
router.post("/:id/pay-now/finalize", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    select: { athleteProfileId: true, athleteProfile: { select: { userId: true } }, stripePaymentIntentId: true, paymentStatus: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.athleteProfile.userId !== user.id) return res.status(403).json({ error: "Not your booking" });
  if (booking.paymentStatus === "succeeded") {
    return res.json({ paymentStatus: "succeeded" });
  }
  if (!booking.stripePaymentIntentId || !stripe) {
    return res.status(400).json({ error: "No payment to finalize" });
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
    if (pi.status === "succeeded") {
      await prisma.booking.update({
        where: { id: req.params.id },
        data: { paymentStatus: "succeeded" },
      });
      return res.json({ paymentStatus: "succeeded" });
    }
    return res.status(400).json({ error: `Payment not completed (status: ${pi.status})` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bookings] pay-now/finalize error:", message);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
});

// Create group booking (organizer). Reserves slot, generates invite link, optionally sends email invites.
router.post("/group", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body as {
    coachId?: string;
    slotId?: string;
    groupSize?: number;
    message?: string;
    participantEmails?: string[];
    payment_method?: string;
  };

  const { coachId, slotId, groupSize, message, participantEmails, payment_method: paymentMethodId } = body;
  if (!coachId || !slotId) return res.status(400).json({ error: "coachId and slotId are required" });
  if (!groupSize || groupSize < 2 || groupSize > 20) return res.status(400).json({ error: "groupSize must be between 2 and 20" });

  try {
    const slot = await prisma.availabilitySlot.findFirst({
      where: { id: slotId, coachId },
      include: { coach: { include: { user: { select: { email: true } } } } },
    });
    if (!slot) return res.status(404).json({ error: "Slot not found" });
    if (slot.status !== "available") return res.status(400).json({ error: "Slot is not available" });
    if (groupSize > slot.maxCapacity) return res.status(400).json({ error: `Group size exceeds slot capacity (max ${slot.maxCapacity})` });

    const athleteProfileId = await getAthleteProfileId(user.id);
    if (!athleteProfileId) return res.status(400).json({ error: "No athlete profile found" });

    const existingBooking = await prisma.booking.findFirst({
      where: { slotId, athleteProfileId, status: { not: "cancelled" } },
    });
    if (existingBooking) return res.status(409).json({ error: "You already have a booking for this slot" });

    const confirmedCount = await prisma.booking.count({
      where: { slotId, status: { in: ["confirmed", "pending"] }, groupBookingId: { not: null } },
    });
    if (confirmedCount > 0) return res.status(409).json({ error: "Slot already has a group booking" });

    const coach = slot.coach;
    const hourlyRate = coach.hourlyRate ? Number(coach.hourlyRate) : null;
    const hasRate = hourlyRate != null && hourlyRate > 0;
    const groupRates = coach.groupRates as Record<string, number> | null;
    const perPersonAmountCents = hasRate
      ? computePerPersonAmountCents(slot, groupSize, groupRates, hourlyRate!)
      : null;

    const needsPayment =
      isStripeEnabled() && stripe && hasRate && !!coach.stripeConnectAccountId && coach.billingMode === "upfront";

    if (needsPayment && !paymentMethodId) {
      return res.status(400).json({ error: "Payment method required", code: "PAYMENT_METHOD_REQUIRED" });
    }

    const inviteCode = generateInviteCode();

    const booking = await prisma.booking.create({
      data: {
        athleteProfileId,
        coachId,
        slotId,
        message: message?.trim() || null,
        groupSize,
        inviteCode,
        isGroupOrganizer: true,
        amountCents: perPersonAmountCents ?? undefined,
        currency: "usd",
        paymentStatus: needsPayment ? "pending_authorization" : (hasRate ? "deferred" : undefined),
      },
      include: {
        coach: { include: { user: { select: { email: true } } } },
        slot: true,
        athleteProfile: { include: { user: { select: { email: true, name: true } } } },
      },
    });

    let clientSecret: string | null = null;

    if (needsPayment && perPersonAmountCents != null && stripe) {
      try {
        const athleteUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { email: true, stripeCustomerId: true },
        });
        const customerId = await getOrCreateStripeCustomerId(
          stripe, user.id, athleteUser?.email ?? "", athleteUser?.stripeCustomerId ?? null,
        );
        if (!athleteUser?.stripeCustomerId) {
          await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
        }

        const { clientSecret: secret, paymentIntentId, status: piStatus } = await createPaymentIntentAuthOnly({
          amountCents: perPersonAmountCents,
          currency: "usd",
          customerId,
          paymentMethodId: paymentMethodId || undefined,
          idempotencyKey: `group-${booking.id}`,
          metadata: { bookingId: booking.id },
          connectAccountId: coach.stripeConnectAccountId ?? undefined,
        });
        clientSecret = piStatus === "requires_action" ? secret : null;
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            stripePaymentIntentId: paymentIntentId,
            ...(piStatus === "requires_capture" && { paymentStatus: "authorized" }),
          },
        });
      } catch (err) {
        console.error("[bookings] group create PaymentIntent failed:", err);
        await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: "failed" } });
        return res.status(502).json({ error: "Payment setup failed" });
      }
    }

    // Send group invite emails to participants if provided
    if (participantEmails && participantEmails.length > 0) {
      const frontendUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
      const inviteUrl = `${frontendUrl}/group/${inviteCode}`;
      const inviterName = booking.athleteProfile?.user.name ?? null;
      const groupRates = coach.groupRates as Record<string, number> | null;
      const hourlyRate = coach.hourlyRate ? Number(coach.hourlyRate) : null;
      const perPersonRate = hourlyRate
        ? (groupRates?.[String(groupSize)] ?? hourlyRate)
        : null;
      for (const email of participantEmails.slice(0, 20)) {
        if (typeof email === "string" && email.includes("@")) {
          sendGroupInviteToAthlete({
            athleteEmail: email,
            inviterName,
            coachDisplayName: coach.displayName,
            sport: coach.sports?.[0] ?? null,
            slotStart: slot.startTime.toISOString(),
            slotEnd: slot.endTime.toISOString(),
            perPersonRate,
            groupSize,
            spotsRemaining: groupSize - 1,
            inviteUrl,
          }).catch((err) => console.error("[bookings] group invite email failed:", err));
        }
      }
    }

    if (booking.coach?.user) {
      sendBookingRequestedToCoach({
        coachEmail: booking.coach.user.email,
        coachPhone: coach.phone ?? null,
        athleteName: booking.athleteProfile?.user.name ?? null,
        slotStart: slot.startTime.toISOString(),
        slotEnd: slot.endTime.toISOString(),
        message: booking.message,
        bookingId: booking.id,
      }).catch((err) => console.error("[bookings] notify coach (group) failed:", err));
    }

    const frontendUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
    const response: Record<string, unknown> = {
      id: booking.id,
      inviteCode,
      inviteUrl: `${frontendUrl}/group/${inviteCode}`,
      groupSize,
      perPersonAmountCents,
      coach: { id: coach.id, displayName: coach.displayName, sports: coach.sports },
      slot: { id: slot.id, startTime: slot.startTime.toISOString(), endTime: slot.endTime.toISOString() },
      status: booking.status,
      paymentStatus: booking.paymentStatus ?? null,
      createdAt: booking.createdAt.toISOString(),
    };
    if (clientSecret) {
      response.clientSecret = clientSecret;
      response.requiresAction = true;
    }
    res.status(201).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[bookings] create group booking error:", message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get session info by invite code (public, no auth needed for landing page)
router.get("/group/:inviteCode", async (req, res) => {
  const booking = await prisma.booking.findUnique({
    where: { inviteCode: req.params.inviteCode },
    include: {
      coach: true,
      slot: { include: { location: true } },
      athleteProfile: { select: { displayName: true, avatarUrl: true } },
    },
  });
  if (!booking) return res.status(404).json({ error: "Session not found" });

  const allBookings = await prisma.booking.findMany({
    where: { slotId: booking.slotId, status: { not: "cancelled" } },
    include: { athleteProfile: { select: { displayName: true, avatarUrl: true } } },
    orderBy: { createdAt: "asc" },
  });

  const maxCapacity = booking.slot.maxCapacity;
  const joinedCount = allBookings.length;
  const spotsRemaining = Math.max(0, maxCapacity - joinedCount);

  const hourlyRate = booking.coach.hourlyRate ? Number(booking.coach.hourlyRate) : null;
  const groupRates = booking.coach.groupRates as Record<string, number> | null;
  const currentPerPersonRate = hourlyRate ? getPerPersonRate(Math.max(joinedCount, 1), groupRates, hourlyRate) : null;
  const durationMs = booking.slot.endTime.getTime() - booking.slot.startTime.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  res.json({
    id: booking.id,
    coach: {
      id: booking.coach.id,
      displayName: booking.coach.displayName,
      sports: booking.coach.sports,
      avatarUrl: booking.coach.avatarUrl,
    },
    slot: {
      id: booking.slot.id,
      startTime: booking.slot.startTime.toISOString(),
      endTime: booking.slot.endTime.toISOString(),
      durationMinutes,
      location: booking.slot.location
        ? { name: booking.slot.location.name, address: booking.slot.location.address }
        : null,
    },
    maxCapacity,
    joinedCount,
    spotsRemaining,
    currentPerPersonRate,
    hourlyRate,
    groupRates,
    status: booking.status,
    participants: allBookings.map((b) => ({
      displayName: b.athleteProfile.displayName,
      avatarUrl: b.athleteProfile.avatarUrl,
    })),
  });
});

// Join a group booking via invite code
router.post("/group/:inviteCode/join", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const paymentMethodId = (req.body as { payment_method?: string }).payment_method as string | undefined;

  const organizerBooking = await prisma.booking.findUnique({
    where: { inviteCode: req.params.inviteCode },
    include: {
      coach: { include: { user: { select: { email: true } } } },
      slot: true,
      groupMembers: { where: { status: { not: "cancelled" } }, select: { id: true } },
    },
  });
  if (!organizerBooking || !organizerBooking.isGroupOrganizer) {
    return res.status(404).json({ error: "Group booking not found" });
  }
  if (organizerBooking.status === "cancelled") {
    return res.status(400).json({ error: "This group session has been cancelled" });
  }

  const joinedCount = organizerBooking.groupMembers.length + 1;
  if (joinedCount >= organizerBooking.groupSize) {
    return res.status(409).json({ error: "This group session is full" });
  }

  const athleteProfileId = await getAthleteProfileId(user.id);
  if (!athleteProfileId) return res.status(400).json({ error: "No athlete profile found" });

  if (organizerBooking.athleteProfileId === athleteProfileId) {
    return res.status(409).json({ error: "You are already the organizer of this session" });
  }

  const existingJoin = await prisma.booking.findFirst({
    where: { groupBookingId: organizerBooking.id, athleteProfileId, status: { not: "cancelled" } },
  });
  if (existingJoin) return res.status(409).json({ error: "You have already joined this session" });

  const coach = organizerBooking.coach;
  const hourlyRate = coach.hourlyRate ? Number(coach.hourlyRate) : null;
  const hasRate = hourlyRate != null && hourlyRate > 0;
  const groupRates = coach.groupRates as Record<string, number> | null;
  const perPersonAmountCents = hasRate
    ? computePerPersonAmountCents(organizerBooking.slot, organizerBooking.groupSize, groupRates, hourlyRate!)
    : null;

  const needsPayment =
    isStripeEnabled() && stripe && hasRate && !!coach.stripeConnectAccountId && coach.billingMode === "upfront";

  if (needsPayment && !paymentMethodId) {
    return res.status(400).json({ error: "Payment method required", code: "PAYMENT_METHOD_REQUIRED" });
  }

  const participantBooking = await prisma.booking.create({
    data: {
      athleteProfileId,
      coachId: organizerBooking.coachId,
      slotId: organizerBooking.slotId,
      groupSize: organizerBooking.groupSize,
      isGroupOrganizer: false,
      groupBookingId: organizerBooking.id,
      amountCents: perPersonAmountCents ?? undefined,
      currency: "usd",
      paymentStatus: needsPayment ? "pending_authorization" : (hasRate ? "deferred" : undefined),
    },
  });

  let clientSecret: string | null = null;

  if (needsPayment && perPersonAmountCents != null && stripe) {
    try {
      const athleteUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, stripeCustomerId: true },
      });
      const customerId = await getOrCreateStripeCustomerId(
        stripe, user.id, athleteUser?.email ?? "", athleteUser?.stripeCustomerId ?? null,
      );
      if (!athleteUser?.stripeCustomerId) {
        await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
      }

      const { clientSecret: secret, paymentIntentId, status: piStatus } = await createPaymentIntentAuthOnly({
        amountCents: perPersonAmountCents,
        currency: "usd",
        customerId,
        paymentMethodId: paymentMethodId || undefined,
        idempotencyKey: `group-join-${participantBooking.id}`,
        metadata: { bookingId: participantBooking.id },
        connectAccountId: coach.stripeConnectAccountId ?? undefined,
      });
      clientSecret = piStatus === "requires_action" ? secret : null;
      await prisma.booking.update({
        where: { id: participantBooking.id },
        data: {
          stripePaymentIntentId: paymentIntentId,
          ...(piStatus === "requires_capture" && { paymentStatus: "authorized" }),
        },
      });
    } catch (err) {
      console.error("[bookings] group join PaymentIntent failed:", err);
      await prisma.booking.update({ where: { id: participantBooking.id }, data: { paymentStatus: "failed" } });
      return res.status(502).json({ error: "Payment setup failed" });
    }
  }

  // Notify the coach that a new participant has joined and needs confirmation
  const joiningAthlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
    select: { displayName: true },
  });
  sendBookingRequestedToCoach({
    coachEmail: coach.user.email,
    coachPhone: coach.phone,
    athleteName: joiningAthlete?.displayName ?? null,
    slotStart: organizerBooking.slot.startTime.toISOString(),
    slotEnd: organizerBooking.slot.endTime.toISOString(),
    message: `Joined your group session (${organizerBooking.groupMembers.length + 2} of ${organizerBooking.groupSize} spots filled)`,
    bookingId: organizerBooking.id,
  }).catch((err) => console.error("[bookings] group join coach notification failed:", err));

  const response: Record<string, unknown> = {
    id: participantBooking.id,
    groupBookingId: organizerBooking.id,
    perPersonAmountCents,
    status: participantBooking.status,
    paymentStatus: participantBooking.paymentStatus ?? null,
  };
  if (clientSecret) {
    response.clientSecret = clientSecret;
    response.requiresAction = true;
  }
  res.status(201).json(response);
});

// Create booking (athlete). Supports flexible sessions: multi-booking per slot,
// dynamic pricing by headcount, and lockPrivate option to guarantee 1:1.
router.post("/", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = bookingCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { coachId, slotId, message } = parsed.data;
  const paymentMethodId = (req.body as { payment_method?: string }).payment_method as string | undefined;
  const lockPrivate = (req.body as { lockPrivate?: boolean }).lockPrivate === true;

  try {
    const slot = await prisma.availabilitySlot.findFirst({
      where: { id: slotId, coachId },
      include: {
        coach: { include: { user: { select: { email: true } } } },
        bookings: {
          where: { status: { not: "cancelled" } },
          select: { id: true, status: true, lockedPrivate: true, athleteProfileId: true },
        },
      },
    });
    if (!slot)
      return res.status(404).json({ error: "Slot not found" });
    if (slot.status !== "available")
      return res.status(400).json({ error: "Slot is not available" });
    if (!slot.coach?.user) {
      console.error("[bookings] create booking: coach has no user record", { coachId: slot.coach?.id });
      return res.status(503).json({ error: "Coach account is not set up correctly. Please try again later." });
    }

    const createAthleteProfileId = await getAthleteProfileId(user.id);
    if (!createAthleteProfileId) return res.status(400).json({ error: "No athlete profile found. Complete your athlete profile first." });

    const myExisting = slot.bookings.find((b) => b.athleteProfileId === createAthleteProfileId);
    if (myExisting)
      return res.status(409).json({ error: "You already have a pending request for this slot", code: "PENDING_REQUEST" });

    const activeBookings = slot.bookings;
    const confirmedCount = activeBookings.filter((b) => b.status === "confirmed" || b.status === "completed").length;
    const anyLocked = activeBookings.some((b) => b.lockedPrivate);

    // Enforce capacity limits
    if (slot.maxCapacity === 1 && activeBookings.length > 0) {
      return res.status(409).json({ error: "Slot is already booked" });
    }
    if (anyLocked) {
      return res.status(409).json({ error: "This session is locked as a private session" });
    }
    if (lockPrivate && !slot.allowPrivate) {
      return res.status(400).json({ error: "Private booking is not allowed for this session" });
    }
    if (confirmedCount >= slot.maxCapacity) {
      return res.status(409).json({ error: "This session is full" });
    }

    const athleteUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true, stripeCustomerId: true },
    });
    if (!athleteUser) return res.status(401).json({ error: "User not found" });

    const coach = slot.coach;
    const hourlyRate = coach.hourlyRate ? Number(coach.hourlyRate) : null;
    const hasRate = hourlyRate != null && hourlyRate > 0;
    const groupRates = coach.groupRates as Record<string, number> | null;

    // Dynamic pricing: headcount = current confirmed + this booking
    const headcount = lockPrivate ? 1 : confirmedCount + 1;
    const amountCents = hasRate
      ? (slot.maxCapacity > 1 && !lockPrivate
          ? computePerPersonAmountCents(slot, headcount, groupRates, hourlyRate!)
          : computeAmountCents(slot, hourlyRate!))
      : null;

    const needsPayment =
      isStripeEnabled() &&
      stripe &&
      hasRate &&
      !!coach.stripeConnectAccountId &&
      coach.billingMode === "upfront";
    const currency = "usd";

    if (needsPayment && !paymentMethodId) {
      return res.status(400).json({
        error: "Payment method required.",
        code: "PAYMENT_METHOD_REQUIRED",
      });
    }

    const bookingInviteCode = generateInviteCode();

    const booking = await prisma.booking.create({
      data: {
        athleteProfileId: createAthleteProfileId,
        coachId,
        slotId,
        message: message?.trim() || null,
        amountCents: amountCents ?? undefined,
        currency,
        groupSize: headcount,
        lockedPrivate: lockPrivate,
        inviteCode: bookingInviteCode,
        paymentStatus: needsPayment ? "pending_authorization" : (hasRate ? "deferred" : undefined),
      },
      include: {
        coach: { include: { user: { select: { email: true } } } },
        slot: true,
        athleteProfile: { include: { user: { select: { email: true, name: true } } } },
      },
    });

    let clientSecret: string | null = null;

    if (needsPayment && amountCents != null && stripe) {
      try {
        const customerId = await getOrCreateStripeCustomerId(
          stripe,
          user.id,
          athleteUser.email ?? "",
          athleteUser.stripeCustomerId
        );
        if (!athleteUser.stripeCustomerId)
          await prisma.user.update({
            where: { id: user.id },
            data: { stripeCustomerId: customerId },
          });

        const { clientSecret: secret, paymentIntentId, status: piStatus } = await createPaymentIntentAuthOnly({
          amountCents,
          currency,
          customerId,
          paymentMethodId: paymentMethodId || undefined,
          idempotencyKey: booking.id,
          metadata: { bookingId: booking.id },
          connectAccountId: booking.coach.stripeConnectAccountId ?? undefined,
        });
        clientSecret = piStatus === "requires_action" ? secret : null;
        await prisma.booking.update({
          where: { id: booking.id },
          data: {
            stripePaymentIntentId: paymentIntentId,
            ...(piStatus === "requires_capture" && { paymentStatus: "authorized" as const }),
          },
        });
      } catch (err) {
        console.error("[bookings] create PaymentIntent failed:", err);
        await prisma.booking.update({
          where: { id: booking.id },
          data: { paymentStatus: "failed" },
        });
        return res.status(502).json({
          error: "Payment setup failed. Please try again or use a different card.",
        });
      }
    }

    if (booking.coach?.user) {
      sendBookingRequestedToCoach({
        coachEmail: booking.coach.user.email,
        coachPhone: booking.coach.phone ?? null,
        athleteName: booking.athleteProfile?.user.name ?? null,
        slotStart: booking.slot.startTime.toISOString(),
        slotEnd: booking.slot.endTime.toISOString(),
        message: booking.message,
        bookingId: booking.id,
        lockedPrivate: booking.lockedPrivate,
      }).catch((err) => console.error("[bookings] notify coach failed:", err));
    } else {
      console.error("[bookings] create booking: skipping coach notification (no coach.user)", { bookingId: booking.id });
    }

    if (booking.athleteProfile?.user) {
      sendBookingRequestSubmittedToAthlete({
        athleteEmail: booking.athleteProfile.user.email,
        athleteName: booking.athleteProfile.user.name ?? null,
        coachDisplayName: booking.coach.displayName,
        slotStart: booking.slot.startTime.toISOString(),
        slotEnd: booking.slot.endTime.toISOString(),
        bookingId: booking.id,
      }).catch((err) => console.error("[bookings] notify athlete (request submitted) failed:", err));
    } else {
      console.error("[bookings] create booking: skipping athlete notification (no athlete)", { bookingId: booking.id });
    }

    // Notify existing athletes on this slot about the price drop
    if (slot.maxCapacity > 1 && !lockPrivate && confirmedCount > 0 && hasRate) {
      const newHeadcount = confirmedCount + 1;
      const newPerPersonRate = getPerPersonRate(newHeadcount, groupRates, hourlyRate!);
      const existingBookings = await prisma.booking.findMany({
        where: { slotId, status: { not: "cancelled" }, id: { not: booking.id } },
        include: { athleteProfile: { include: { user: { select: { email: true, name: true } } } } },
      });
      for (const eb of existingBookings) {
        if (eb.athleteProfile?.user?.email) {
          sendPriceDropNotification({
            athleteEmail: eb.athleteProfile.user.email,
            athleteName: eb.athleteProfile.user.name ?? null,
            coachDisplayName: coach.displayName,
            slotStart: slot.startTime.toISOString(),
            slotEnd: slot.endTime.toISOString(),
            newPerPersonRate,
            headcount: newHeadcount,
            bookingId: eb.id,
          }).catch((err) => console.error("[bookings] price drop notification failed:", err));
        }
      }
    }

    const response: Record<string, unknown> = {
      id: booking.id,
      coach: {
        id: booking.coach.id,
        displayName: booking.coach.displayName,
        sports: booking.coach.sports,
      },
      slot: {
        id: booking.slot.id,
        startTime: booking.slot.startTime.toISOString(),
        endTime: booking.slot.endTime.toISOString(),
      },
      status: booking.status,
      amountCents: booking.amountCents ?? null,
      paymentStatus: booking.paymentStatus ?? null,
      createdAt: booking.createdAt.toISOString(),
      lockedPrivate: booking.lockedPrivate,
    };
    if (clientSecret) {
      (response as { clientSecret: string }).clientSecret = clientSecret;
      (response as { requiresAction: boolean }).requiresAction = true;
    }

    res.status(201).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[bookings] create booking error:", message, stack ?? "");
    res.status(500).json({
      error: "Internal server error",
      ...(process.env.NODE_ENV !== "production" && { detail: message }),
    });
  }
});

// Update booking (accept/decline/complete). Charge and transfer to coach only on "completed".
router.patch("/:id", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = bookingUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { status } = parsed.data;

  const attendance = (req.body as { attendance?: { bookingId: string; attended: boolean }[] }).attendance;
  const adjustedGroupSize = (req.body as { adjustedGroupSize?: number }).adjustedGroupSize;

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      coach: true,
      slot: true,
      athleteProfile: { select: { userId: true } },
      groupMembers: { where: { status: { not: "cancelled" } } },
    },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const patchCoachProfile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });

  const isCoach = patchCoachProfile?.id === booking.coachId;
  const isAthlete = user.id === booking.athleteProfile.userId;

  if (status === "confirmed") {
    if (!isCoach)
      return res.status(403).json({ error: "Only the coach can accept/decline" });
  } else if (status === "cancelled") {
    if (isCoach) {
      // Coach can always cancel (accept/decline flow).
    } else if (isAthlete && booking.status === "pending") {
      // Athlete can cancel their own pending request (e.g. after card auth failed so slot is released).
    } else {
      return res.status(403).json({ error: "Only the coach can cancel this booking" });
    }
  } else if (status === "completed") {
    if (!isCoach)
      return res.status(403).json({ error: "Only the coach can mark complete" });
  }

  // On cancel: cancel PaymentIntent so the hold is released or the incomplete PI is closed.
  if (status === "cancelled" && booking.stripePaymentIntentId) {
    try {
      await cancelPaymentIntent(booking.stripePaymentIntentId);
    } catch (err) {
      console.error("[bookings] cancel PaymentIntent failed:", err);
    }
  }

  // On cancel for group organizer: also cancel all group member bookings
  if (status === "cancelled" && booking.isGroupOrganizer && booking.groupMembers.length > 0) {
    for (const member of booking.groupMembers) {
      if (member.stripePaymentIntentId) {
        try { await cancelPaymentIntent(member.stripePaymentIntentId); } catch {}
      }
      await prisma.booking.update({
        where: { id: member.id },
        data: { status: "cancelled", ...(member.stripePaymentIntentId && { paymentStatus: "canceled" }) },
      });
    }
  }

  // Handle flexible session: reprice all bookings on the slot by final headcount
  if (status === "completed") {
    // Find ALL non-cancelled bookings on this slot (not just group members)
    const slotBookings = await prisma.booking.findMany({
      where: { slotId: booking.slotId, status: { not: "cancelled" }, id: { not: booking.id } },
      include: { athleteProfile: { select: { user: { select: { email: true, name: true } } } } },
    });

    const allSlotBookings = [booking, ...slotBookings];
    const attendedBookings = allSlotBookings.filter((b) => {
      const att = attendance?.find((a) => a.bookingId === b.id);
      return att ? att.attended : b.attended;
    });
    const finalHeadcount = attendedBookings.length;

    // Reprice all bookings based on final headcount (only if multi-person slot)
    if (booking.slot.maxCapacity > 1 && finalHeadcount > 0) {
      const hourlyRate = booking.coach.hourlyRate ? Number(booking.coach.hourlyRate) : null;
      if (hourlyRate) {
        const groupRates = booking.coach.groupRates as Record<string, number> | null;
        const newPerPerson = computePerPersonAmountCents(booking.slot, finalHeadcount, groupRates, hourlyRate);
        for (const sb of allSlotBookings) {
          if (sb.amountCents !== newPerPerson) {
            await prisma.booking.update({ where: { id: sb.id }, data: { amountCents: newPerPerson, groupSize: finalHeadcount } });
            if (sb.id === booking.id) booking.amountCents = newPerPerson;
          }
        }
      }
    }

    // Update attendance
    if (attendance && Array.isArray(attendance)) {
      for (const entry of attendance) {
        if (entry.bookingId && typeof entry.attended === "boolean") {
          await prisma.booking.update({ where: { id: entry.bookingId }, data: { attended: entry.attended } });
          if (!entry.attended) {
            const noShowBooking = slotBookings.find((m) => m.id === entry.bookingId) ??
              (entry.bookingId === booking.id ? booking : null);
            if (noShowBooking?.stripePaymentIntentId) {
              try { await cancelPaymentIntent(noShowBooking.stripePaymentIntentId); } catch {}
              await prisma.booking.update({ where: { id: entry.bookingId }, data: { paymentStatus: "canceled" } });
            }
          }
        }
      }
    }

    // Complete all other bookings on the slot who attended
    for (const member of slotBookings) {
      const memberAttendance = attendance?.find((a) => a.bookingId === member.id);
      const didAttend = memberAttendance ? memberAttendance.attended : member.attended;
      if (didAttend) {
        let memberPaymentOk = false;
        if (member.stripePaymentIntentId && member.amountCents != null && booking.coach.stripeConnectAccountId && stripe) {
          try {
            const pi = await stripe.paymentIntents.retrieve(member.stripePaymentIntentId);
            if (pi.status === "requires_capture") {
              await capturePaymentIntent(member.stripePaymentIntentId);
              const isDestCharge = !!pi.transfer_data?.destination;
              if (!isDestCharge && booking.coach.stripeConnectAccountId) {
                await transferToConnectAccount({
                  amountCents: member.amountCents,
                  currency: member.currency ?? "usd",
                  connectAccountId: booking.coach.stripeConnectAccountId,
                  transferGroup: member.id,
                });
              }
              memberPaymentOk = true;
            } else if (pi.status === "succeeded") {
              memberPaymentOk = true;
            }
          } catch (err) {
            console.error("[bookings] slot member capture failed:", err);
          }
        }
        await prisma.booking.update({
          where: { id: member.id },
          data: {
            status: "completed",
            completedAt: new Date(),
            ...(memberPaymentOk && { paymentStatus: "succeeded" }),
          },
        });
        if (
          booking.coach.billingMode === "after_session" &&
          member.paymentStatus === "deferred" &&
          member.amountCents != null &&
          booking.coach.stripeConnectAccountId
        ) {
          const frontendUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
          if (member.athleteProfile?.user?.email) {
            await prisma.booking.update({ where: { id: member.id }, data: { paymentStatus: "payment_link_sent" } });
            sendPaymentLinkToAthlete({
              athleteEmail: member.athleteProfile.user.email,
              athleteName: member.athleteProfile.user.name ?? undefined,
              coachDisplayName: booking.coach.displayName,
              amountCents: member.amountCents,
              currency: member.currency ?? "usd",
              paymentUrl: `${frontendUrl}/bookings/${member.id}`,
              slotStart: booking.slot.startTime.toISOString(),
              slotEnd: booking.slot.endTime.toISOString(),
              sessionCompleted: true,
            }).catch((err) => console.error("[bookings] slot member payment link failed:", err));
          }
        }
      }
    }
  }

  // On complete: capture payment then transfer to coach (charge happens here, not on accept).
  // Use Stripe PI status so we capture even if our DB wasn't updated by the webhook (e.g. pending_authorization).
  let paymentCapturedOrSucceeded = false;
  if (status === "completed" && booking.stripePaymentIntentId && booking.amountCents != null && booking.coach.stripeConnectAccountId && stripe) {
    try {
      const pi = await stripe.paymentIntents.retrieve(booking.stripePaymentIntentId);
      if (pi.status === "requires_capture") {
        await capturePaymentIntent(booking.stripePaymentIntentId);
        // If this was a destination charge, Stripe already splits on capture. Otherwise transfer from platform balance.
        const isDestinationCharge = !!pi.transfer_data?.destination;
        if (!isDestinationCharge && booking.coach.stripeConnectAccountId) {
          await transferToConnectAccount({
            amountCents: booking.amountCents,
            currency: booking.currency ?? "usd",
            connectAccountId: booking.coach.stripeConnectAccountId,
            transferGroup: booking.id,
          });
        }
        paymentCapturedOrSucceeded = true;
      } else if (pi.status === "succeeded") {
        paymentCapturedOrSucceeded = true;
      } else {
        return res.status(400).json({
          error: "Payment cannot be captured yet.",
          detail: `Payment status is ${pi.status}. The card may not have been authorized.`,
        });
      }
    } catch (err) {
      console.error("[bookings] capture or transfer failed:", err);
      const stripeErr = err as { code?: string; message?: string; raw?: { message?: string } };
      const code = stripeErr?.code ?? stripeErr?.raw?.code;
      const message = stripeErr?.message ?? stripeErr?.raw?.message ?? "Unknown error";
      let detail = message;
      if (code === "balance_insufficient") {
        detail =
          "Your Stripe account has insufficient balance to transfer to the coach. In test mode, add balance using the test card 4000000000000077 (see Stripe testing docs).";
      }
      return res.status(502).json({
        error: "Payment capture failed. Please try again.",
        detail,
      });
    }
  }

  const updated = await prisma.booking.update({
    where: { id: req.params.id },
    data: {
      status,
      ...(status === "completed" && {
        completedAt: new Date(),
        ...(paymentCapturedOrSucceeded && { paymentStatus: "succeeded" as const }),
      }),
      ...(status === "cancelled" && booking.stripePaymentIntentId != null && { paymentStatus: "canceled" as const }),
    },
    include: {
      coach: true,
      slot: true,
      athleteProfile: { include: { user: { select: { email: true, name: true } } } },
    },
  });

  // When completing a deferred-payment booking, send a single combined email instead of
  // separate "completed" + "payment requested" emails.
  const isDeferredCompleted =
    status === "completed" &&
    booking.paymentStatus === "deferred" &&
    booking.amountCents != null &&
    updated.coach.stripeConnectAccountId;

  if ((status === "confirmed" || status === "cancelled" || status === "completed") && !isDeferredCompleted) {
    sendBookingStatusToAthlete({
      athleteEmail: updated.athleteProfile.user.email,
      athleteName: updated.athleteProfile.user.name ?? undefined,
      coachDisplayName: updated.coach.displayName,
      newStatus: status,
      slotStart: updated.slot.startTime.toISOString(),
      slotEnd: updated.slot.endTime.toISOString(),
      bookingId: updated.id,
    }).catch((err) => console.error("[bookings] notify athlete failed:", err));
  }

  if (isDeferredCompleted) {
    const frontendUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
    try {
      await prisma.booking.update({
        where: { id: updated.id },
        data: { paymentStatus: "payment_link_sent" },
      });
      updated.paymentStatus = "payment_link_sent";
      if (updated.athleteProfile.user.email) {
        sendPaymentLinkToAthlete({
          athleteEmail: updated.athleteProfile.user.email,
          athleteName: updated.athleteProfile.user.name ?? undefined,
          coachDisplayName: updated.coach.displayName,
          amountCents: booking.amountCents!,
          currency: booking.currency ?? "usd",
          paymentUrl: `${frontendUrl}/bookings/${updated.id}`,
          slotStart: updated.slot.startTime.toISOString(),
          slotEnd: updated.slot.endTime.toISOString(),
          sessionCompleted: true,
        }).catch((err) => console.error("[bookings] auto-send payment link email failed:", err));
      }
    } catch (err) {
      console.error("[bookings] auto-send payment link failed:", err);
    }
  }

  res.json({
    id: updated.id,
    coach: {
      id: updated.coach.id,
      displayName: updated.coach.displayName,
      sports: updated.coach.sports,
    },
    slot: {
      id: updated.slot.id,
      startTime: updated.slot.startTime.toISOString(),
      endTime: updated.slot.endTime.toISOString(),
    },
    status: updated.status,
    amountCents: updated.amountCents ?? null,
    paymentStatus: updated.paymentStatus ?? null,
    createdAt: updated.createdAt.toISOString(),
  });
});

// Send payment link to athlete for a deferred-payment booking (coach only)
router.post("/:id/payment-request", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      coach: true,
      slot: true,
      athleteProfile: { include: { user: { select: { email: true, name: true } } } },
    },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const isPayReqCoach = booking.coach.userId === user.id;
  if (!isPayReqCoach) return res.status(403).json({ error: "Only the coach can request payment" });

  if (!["confirmed", "completed"].includes(booking.status)) {
    return res.status(400).json({ error: "Booking must be confirmed or completed to request payment" });
  }
  if (!["deferred", "payment_link_sent"].includes(booking.paymentStatus ?? "")) {
    return res.status(400).json({ error: `Payment already ${booking.paymentStatus ?? "processed"}` });
  }
  if (!booking.coach.stripeConnectAccountId) {
    return res.status(400).json({ error: "Set up Stripe Connect before requesting payment" });
  }
  if (!booking.amountCents) {
    return res.status(400).json({ error: "Payment amount not set" });
  }

  const frontendUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");
  const paymentUrl = `${frontendUrl}/bookings/${booking.id}`;

  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentStatus: "payment_link_sent" },
  });

  if (booking.athleteProfile.user.email) {
    sendPaymentLinkToAthlete({
      athleteEmail: booking.athleteProfile.user.email,
      athleteName: booking.athleteProfile.user.name ?? undefined,
      coachDisplayName: booking.coach.displayName,
      amountCents: booking.amountCents,
      currency: booking.currency ?? "usd",
      paymentUrl,
      slotStart: booking.slot.startTime.toISOString(),
      slotEnd: booking.slot.endTime.toISOString(),
    }).catch((err) => console.error("[bookings] send payment link email failed:", err));
  }

  res.json({ paymentStatus: "payment_link_sent", paymentUrl });
});

// Add review (athlete, only for completed bookings)
router.post("/:id/review", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { rating, comment } = parsed.data;

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { athleteProfile: { select: { id: true, userId: true } } },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.athleteProfile.userId !== user.id)
    return res.status(403).json({ error: "Only the athlete can review" });
  if (booking.status !== "completed")
    return res.status(400).json({ error: "Can only review completed bookings" });

  const existing = await prisma.review.findUnique({
    where: { bookingId: booking.id },
  });
  if (existing)
    return res.status(409).json({ error: "Already reviewed" });

  const review = await prisma.review.create({
    data: {
      bookingId: booking.id,
      coachId: booking.coachId,
      athleteProfileId: booking.athleteProfile.id,
      rating,
      comment: comment ?? "",
    },
  });

  res.status(201).json({
    id: review.id,
    rating: review.rating,
    comment: review.comment,
  });
});

export default router;
