import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { sendBookingRequestedToCoach, sendBookingRequestSubmittedToAthlete, sendBookingStatusToAthlete } from "../notifications.js";
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

function computeAmountCents(slot: { startTime: Date; endTime: Date }, hourlyRateDollars: number): number {
  const durationMs = slot.endTime.getTime() - slot.startTime.getTime();
  const hours = durationMs / (60 * 60 * 1000);
  return Math.max(50, Math.ceil(hours * hourlyRateDollars * 100)); // Stripe min 50 cents
}

// List own bookings
router.get("/", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const asAthlete = await prisma.booking.findMany({
    where: { athleteId: user.id },
    include: {
      coach: true,
      slot: true,
      review: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  const asCoach = profile
    ? await prisma.booking.findMany({
        where: { coachId: profile.id },
        include: {
          athlete: true,
          slot: true,
          review: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  res.json({
    asAthlete: asAthlete.map((b) => ({
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
      },
      message: b.message ?? null,
      status: b.status,
      amountCents: b.amountCents ?? null,
      paymentStatus: b.paymentStatus ?? null,
      createdAt: b.createdAt.toISOString(),
      review: b.review
        ? { rating: b.review.rating, comment: b.review.comment }
        : null,
    })),
    asCoach: asCoach.map((b) => ({
      id: b.id,
      athlete: {
        id: b.athlete.id,
        name: b.athlete.name,
        email: b.athlete.email,
      },
      slot: {
        id: b.slot.id,
        startTime: b.slot.startTime.toISOString(),
        endTime: b.slot.endTime.toISOString(),
      },
      message: b.message ?? null,
      status: b.status,
      amountCents: b.amountCents ?? null,
      paymentStatus: b.paymentStatus ?? null,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      review: b.review
        ? { rating: b.review.rating, comment: b.review.comment, createdAt: b.review.createdAt.toISOString() }
        : null,
    })),
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
      select: { athleteId: true, stripePaymentIntentId: true, paymentStatus: true },
    });
    if (!booking || booking.athleteId !== user.id) {
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
      slot: true,
      athlete: true,
      review: true,
    },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });
  const isAthlete = booking.athleteId === user.id;
  const isCoach = profile?.id === booking.coachId;
  if (!isAthlete && !isCoach) return res.status(403).json({ error: "Not your booking" });

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
    },
    athlete: isCoach
      ? {
          id: booking.athlete.id,
          name: booking.athlete.name,
          email: booking.athlete.email,
        }
      : undefined,
    message: booking.message ?? null,
    status: booking.status,
    amountCents: booking.amountCents ?? null,
    paymentStatus: booking.paymentStatus ?? null,
    createdAt: booking.createdAt.toISOString(),
    completedAt: booking.completedAt?.toISOString() ?? null,
    review: booking.review
      ? {
          rating: booking.review.rating,
          comment: booking.review.comment,
          createdAt: booking.review.createdAt.toISOString(),
        }
      : null,
  });
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
  if (booking.athleteId !== user.id) return res.status(403).json({ error: "Not your booking" });
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
    where: { id: booking.athleteId },
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
    select: { athleteId: true, stripePaymentIntentId: true, paymentStatus: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.athleteId !== user.id) return res.status(403).json({ error: "Not your booking" });
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

// Create booking (athlete). If coach has rate + Connect, create auth-hold and return clientSecret.
router.post("/", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const parsed = bookingCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { coachId, slotId, message } = parsed.data;
  const paymentMethodId = (req.body as { payment_method?: string }).payment_method as string | undefined;

  const slot = await prisma.availabilitySlot.findFirst({
    where: { id: slotId, coachId },
    include: { coach: true },
  });
  if (!slot)
    return res.status(404).json({ error: "Slot not found" });
  if (slot.status !== "available")
    return res.status(400).json({ error: "Slot is not available" });

  const myExisting = await prisma.booking.findFirst({
    where: { slotId, athleteId: user.id, status: { not: "cancelled" } },
  });
  if (myExisting)
    return res.status(409).json({ error: "You already have a pending request for this slot", code: "PENDING_REQUEST" });

  const confirmedBooking = await prisma.booking.findFirst({
    where: { slotId, status: "confirmed" },
  });
  if (confirmedBooking)
    return res.status(409).json({ error: "Slot is already booked" });

  const athleteUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, stripeCustomerId: true },
  });
  if (!athleteUser) return res.status(401).json({ error: "User not found" });

  const coach = slot.coach;
  const hourlyRate = coach.hourlyRate ? Number(coach.hourlyRate) : null;
  const hasRate = hourlyRate != null && hourlyRate > 0;
  const needsPayment =
    isStripeEnabled() &&
    stripe &&
    hasRate &&
    !!coach.stripeConnectAccountId &&
    coach.billingMode === "upfront";

  const amountCents = hasRate ? computeAmountCents(slot, hourlyRate!) : null;
  const currency = "usd";

  if (needsPayment && !paymentMethodId) {
    return res.status(400).json({
      error: "Payment method required.",
      code: "PAYMENT_METHOD_REQUIRED",
    });
  }

  const booking = await prisma.booking.create({
    data: {
      athleteId: user.id,
      coachId,
      slotId,
      message: message?.trim() || null,
      amountCents: amountCents ?? undefined,
      currency,
      paymentStatus: needsPayment ? "pending_authorization" : (hasRate ? "deferred" : undefined),
    },
    include: {
      coach: { include: { user: { select: { email: true } } } },
      slot: true,
      athlete: { select: { email: true, name: true } },
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
      // When we had a payment method, we confirmed on the server: requires_capture = done; requires_action = 3DS on client.
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

  sendBookingRequestedToCoach({
    coachEmail: booking.coach.user.email,
    coachPhone: booking.coach.phone ?? null,
    athleteName: booking.athlete.name ?? null,
    slotStart: booking.slot.startTime.toISOString(),
    slotEnd: booking.slot.endTime.toISOString(),
    message: booking.message,
    bookingId: booking.id,
  }).catch((err) => console.error("[bookings] notify coach failed:", err));

  sendBookingRequestSubmittedToAthlete({
    athleteEmail: booking.athlete.email,
    athleteName: booking.athlete.name ?? null,
    coachDisplayName: booking.coach.displayName,
    slotStart: booking.slot.startTime.toISOString(),
    slotEnd: booking.slot.endTime.toISOString(),
    bookingId: booking.id,
  }).catch((err) => console.error("[bookings] notify athlete (request submitted) failed:", err));

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
  };
  if (clientSecret) {
    (response as { clientSecret: string }).clientSecret = clientSecret;
    (response as { requiresAction: boolean }).requiresAction = true;
  }

  res.status(201).json(response);
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

  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: { coach: true, slot: true },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const profile = await prisma.coachProfile.findUnique({
    where: { userId: user.id },
  });

  const isCoach = profile?.id === booking.coachId;
  const isAthlete = user.id === booking.athleteId;

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
      athlete: { select: { email: true, name: true } },
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
      athleteEmail: updated.athlete.email,
      athleteName: updated.athlete.name ?? undefined,
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
      if (updated.athlete.email) {
        sendPaymentLinkToAthlete({
          athleteEmail: updated.athlete.email,
          athleteName: updated.athlete.name ?? undefined,
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
      athlete: { select: { email: true, name: true } },
    },
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  const isCoach = booking.coach.userId === user.id;
  if (!isCoach) return res.status(403).json({ error: "Only the coach can request payment" });

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

  if (booking.athlete.email) {
    sendPaymentLinkToAthlete({
      athleteEmail: booking.athlete.email,
      athleteName: booking.athlete.name ?? undefined,
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
  });
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.athleteId !== user.id)
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
      athleteId: user.id,
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
