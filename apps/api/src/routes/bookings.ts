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
  capturePaymentIntent,
  transferToConnectAccount,
  cancelPaymentIntent,
} from "../stripe.js";

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
    })),
  });
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
    where: { slotId, athleteId: user.id },
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
  const needsPayment =
    isStripeEnabled() &&
    stripe &&
    hourlyRate != null &&
    hourlyRate > 0 &&
    !!coach.stripeConnectAccountId;

  const amountCents = needsPayment ? computeAmountCents(slot, hourlyRate!) : null;
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
      paymentStatus: needsPayment ? "pending_authorization" : undefined,
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
        await transferToConnectAccount({
          amountCents: booking.amountCents,
          currency: booking.currency ?? "usd",
          connectAccountId: booking.coach.stripeConnectAccountId,
          transferGroup: booking.id,
        });
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

  if (status === "confirmed" || status === "cancelled" || status === "completed") {
    sendBookingStatusToAthlete({
      athleteEmail: updated.athlete.email,
      athleteName: updated.athlete.name ?? undefined,
      coachDisplayName: updated.coach.displayName,
      newStatus: status,
      slotStart: updated.slot.startTime.toISOString(),
      slotEnd: updated.slot.endTime.toISOString(),
    }).catch((err) => console.error("[bookings] notify athlete failed:", err));
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
