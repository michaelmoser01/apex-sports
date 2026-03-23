import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import {
  cancelPaymentIntent,
} from "../stripe.js";
import { queueEmail } from "../emailQueue.js";

const router = Router();
const auth = authMiddleware();

function computeAmountCents(slot: { startTime: Date; endTime: Date }, hourlyRateDollars: number): number {
  const durationMs = slot.endTime.getTime() - slot.startTime.getTime();
  const hours = durationMs / (60 * 60 * 1000);
  return Math.max(50, Math.ceil(hours * hourlyRateDollars * 100));
}

function getPerPersonRate(
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

function computePerPersonAmountCents(
  slot: { startTime: Date; endTime: Date },
  groupSize: number,
  groupRates: Record<string, number> | null | undefined,
  hourlyRate: number,
): number {
  const perPersonRate = getPerPersonRate(groupSize, groupRates, hourlyRate);
  return computeAmountCents(slot, perPersonRate);
}

// GET /sessions/:slotId -- session detail for coach or participant
router.get("/:slotId", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: req.params.slotId },
    include: {
      coach: { include: { user: { select: { email: true, name: true } } } },
      location: true,
      bookings: {
        include: {
          athleteProfile: { include: { user: { select: { name: true, email: true } } } },
          review: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!slot) return res.status(404).json({ error: "Session not found" });

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  const isCoach = coachProfile?.id === slot.coachId;

  const athleteProfile = await prisma.athleteProfile.findFirst({ where: { userId: user.id }, select: { id: true } });
  const isParticipant = slot.bookings.some((b) => b.athleteProfileId === athleteProfile?.id);

  if (!isCoach && !isParticipant) {
    return res.status(403).json({ error: "Not authorized to view this session" });
  }

  const activeBookings = slot.bookings.filter((b) => b.status !== "cancelled");

  const hourlyRate = slot.coach.hourlyRate ? Number(slot.coach.hourlyRate) : null;
  const groupRates = slot.coach.groupRates as Record<string, number> | null;
  let currentPerPersonAmountCents: number | null = null;
  if (hourlyRate && slot.maxCapacity > 1 && activeBookings.length > 0) {
    currentPerPersonAmountCents = computePerPersonAmountCents(slot, activeBookings.length, groupRates, hourlyRate);
  }

  res.json({
    slotId: slot.id,
    sessionStatus: slot.sessionStatus,
    inviteCode: slot.inviteCode,
    lockedPrivate: slot.lockedPrivate,
    maxCapacity: slot.maxCapacity,
    allowPrivate: slot.allowPrivate,
    startTime: slot.startTime.toISOString(),
    endTime: slot.endTime.toISOString(),
    currentPerPersonAmountCents,
    spotsRemaining: slot.lockedPrivate
      ? 0
      : Math.max(0, slot.maxCapacity - activeBookings.length),
    coach: {
      id: slot.coach.id,
      displayName: slot.coach.displayName,
      sports: slot.coach.sports,
      stripeOnboardingComplete: slot.coach.stripeOnboardingComplete,
      billingMode: slot.coach.billingMode,
    },
    location: slot.location
      ? {
          name: slot.location.name,
          address: slot.location.address,
          notes: slot.location.notes ?? null,
          latitude: slot.location.latitude ? Number(slot.location.latitude) : null,
          longitude: slot.location.longitude ? Number(slot.location.longitude) : null,
        }
      : null,
    participants: slot.bookings.map((b) => ({
      id: b.id,
      athleteProfileId: b.athleteProfileId,
      name: b.athleteProfile.user.name,
      email: isCoach ? b.athleteProfile.user.email : undefined,
      status: b.status,
      amountCents: b.amountCents ?? null,
      paymentStatus: b.paymentStatus ?? null,
      attended: b.attended,
      lockedPrivate: b.lockedPrivate,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt?.toISOString() ?? null,
      message: b.message ?? null,
      coachRecap: b.coachRecap ?? null,
      review: b.review ? { rating: b.review.rating, comment: b.review.comment } : null,
      isCurrentUser: b.athleteProfileId === athleteProfile?.id,
    })),
    viewerRole: isCoach ? "coach" : "athlete",
  });
});

// POST /sessions/:slotId/complete -- complete session (coach only)
router.post("/:slotId/complete", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!coachProfile) return res.status(403).json({ error: "Not a coach" });

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: req.params.slotId },
    include: {
      coach: true,
      bookings: {
        where: { status: { not: "cancelled" } },
        include: { athleteProfile: { select: { user: { select: { email: true, name: true } } } } },
      },
    },
  });
  if (!slot) return res.status(404).json({ error: "Session not found" });
  if (coachProfile.id !== slot.coachId) return res.status(403).json({ error: "Not your session" });

  if (slot.sessionStatus === "completed") {
    return res.status(400).json({ error: "Session already completed" });
  }
  if (slot.sessionStatus === "cancelled") {
    return res.status(400).json({ error: "Session is cancelled" });
  }
  if (slot.bookings.length === 0) {
    return res.status(400).json({ error: "No active participants to complete" });
  }

  const attendance = (req.body as { attendance?: { bookingId: string; attended: boolean }[] }).attendance;

  // Determine who attended
  const allBookings = slot.bookings;
  const attendedBookings = allBookings.filter((b) => {
    const att = attendance?.find((a) => a.bookingId === b.id);
    return att ? att.attended : b.attended;
  });
  const finalHeadcount = attendedBookings.length;

  // Reprice all bookings based on final headcount
  if (slot.maxCapacity > 1 && finalHeadcount > 0) {
    const hourlyRate = slot.coach.hourlyRate ? Number(slot.coach.hourlyRate) : null;
    if (hourlyRate) {
      const groupRates = slot.coach.groupRates as Record<string, number> | null;
      const newPerPerson = computePerPersonAmountCents(slot, finalHeadcount, groupRates, hourlyRate);
      for (const b of allBookings) {
        if (b.amountCents !== newPerPerson) {
          await prisma.booking.update({ where: { id: b.id }, data: { amountCents: newPerPerson, groupSize: finalHeadcount } });
        }
        b.amountCents = newPerPerson;
      }
    }
  }

  // Guard: block completion if deferred payments exist but Stripe isn't set up (checked after repricing)
  const hasDeferredNeedingStripe = attendedBookings.some(
    (b) => b.paymentStatus === "deferred" && (b.amountCents ?? 0) > 0
  );
  if (hasDeferredNeedingStripe && !slot.coach.stripeConnectAccountId) {
    return res.status(400).json({
      error: "Please set up your payment account before completing sessions with outstanding payments.",
      code: "STRIPE_SETUP_REQUIRED",
    });
  }

  // Update attendance
  if (attendance && Array.isArray(attendance)) {
    for (const entry of attendance) {
      if (entry.bookingId && typeof entry.attended === "boolean") {
        await prisma.booking.update({ where: { id: entry.bookingId }, data: { attended: entry.attended } });
        if (!entry.attended) {
          const noShowBooking = allBookings.find((b) => b.id === entry.bookingId);
          if (noShowBooking?.stripePaymentIntentId) {
            try { await cancelPaymentIntent(noShowBooking.stripePaymentIntentId); } catch {}
            await prisma.booking.update({ where: { id: entry.bookingId }, data: { paymentStatus: "canceled" } });
          }
        }
      }
    }
  }

  const frontendUrl = (process.env.APP_URL ?? "http://localhost:5173").replace(/\/$/, "");

  // Complete all attended bookings, handle payments
  for (const booking of allBookings) {
    const att = attendance?.find((a) => a.bookingId === booking.id);
    const didAttend = att ? att.attended : booking.attended;
    if (!didAttend) continue;

    const isDeferredCompleted =
      booking.paymentStatus === "deferred" &&
      booking.amountCents != null &&
      slot.coach.stripeConnectAccountId;

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "completed",
        completedAt: new Date(),
      },
    });

    if (isDeferredCompleted && booking.athleteProfile?.user?.email) {
      await prisma.booking.update({ where: { id: booking.id }, data: { paymentStatus: "payment_link_sent" } });
      await queueEmail("payment_link", {
        athleteEmail: booking.athleteProfile.user.email,
        athleteName: booking.athleteProfile.user.name ?? undefined,
        coachDisplayName: slot.coach.displayName,
        amountCents: booking.amountCents!,
        currency: booking.currency ?? "usd",
        paymentUrl: `${frontendUrl}/bookings/${booking.id}`,
        slotStart: slot.startTime.toISOString(),
        slotEnd: slot.endTime.toISOString(),
        sessionCompleted: true,
      });
    } else if (!isDeferredCompleted && booking.athleteProfile?.user?.email) {
      await queueEmail("booking_status", {
        athleteEmail: booking.athleteProfile.user.email,
        athleteName: booking.athleteProfile.user.name ?? undefined,
        coachDisplayName: slot.coach.displayName,
        newStatus: "completed",
        slotStart: slot.startTime.toISOString(),
        slotEnd: slot.endTime.toISOString(),
        bookingId: booking.id,
      });
    }
  }

  // Update slot session status
  await prisma.availabilitySlot.update({
    where: { id: slot.id },
    data: { sessionStatus: "completed" },
  });

  res.json({ sessionStatus: "completed" });
});

// POST /sessions/:slotId/confirm-all -- confirm all pending participants (coach only)
router.post("/:slotId/confirm-all", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!coachProfile) return res.status(403).json({ error: "Not a coach" });

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: req.params.slotId },
    include: {
      coach: true,
      bookings: {
        where: { status: "pending" },
        include: { athleteProfile: { include: { user: { select: { email: true, name: true } } } } },
      },
    },
  });
  if (!slot) return res.status(404).json({ error: "Session not found" });
  if (coachProfile.id !== slot.coachId) return res.status(403).json({ error: "Not your session" });

  const pendingBookings = slot.bookings;
  if (pendingBookings.length === 0) {
    return res.status(400).json({ error: "No pending participants to confirm" });
  }

  await prisma.booking.updateMany({
    where: { slotId: slot.id, status: "pending" },
    data: { status: "confirmed" },
  });

  if (slot.sessionStatus === "pending" || slot.sessionStatus === "available") {
    await prisma.availabilitySlot.update({
      where: { id: slot.id },
      data: { sessionStatus: "confirmed" },
    });
  }

  for (const booking of pendingBookings) {
    if (booking.athleteProfile?.user?.email) {
      await queueEmail("booking_status", {
        athleteEmail: booking.athleteProfile.user.email,
        athleteName: booking.athleteProfile.user.name ?? undefined,
        coachDisplayName: slot.coach.displayName,
        newStatus: "confirmed",
        slotStart: slot.startTime.toISOString(),
        slotEnd: slot.endTime.toISOString(),
        bookingId: booking.id,
      });
    }
  }

  res.json({ confirmed: pendingBookings.length });
});

// POST /sessions/:slotId/cancel -- cancel entire session (coach only)
router.post("/:slotId/cancel", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (!coachProfile) return res.status(403).json({ error: "Not a coach" });

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: req.params.slotId },
    include: {
      coach: { include: { user: { select: { email: true } } } },
      bookings: {
        where: { status: { not: "cancelled" } },
        include: { athleteProfile: { include: { user: { select: { email: true, name: true } } } } },
      },
    },
  });
  if (!slot) return res.status(404).json({ error: "Session not found" });
  if (coachProfile.id !== slot.coachId) return res.status(403).json({ error: "Not your session" });

  // Cancel all active bookings
  for (const booking of slot.bookings) {
    if (booking.stripePaymentIntentId) {
      try { await cancelPaymentIntent(booking.stripePaymentIntentId); } catch {}
    }
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "cancelled",
        ...(booking.stripePaymentIntentId && { paymentStatus: "canceled" }),
      },
    });

    if (booking.athleteProfile?.user?.email) {
      await queueEmail("booking_status", {
        athleteEmail: booking.athleteProfile.user.email,
        athleteName: booking.athleteProfile.user.name ?? undefined,
        coachDisplayName: slot.coach.displayName,
        newStatus: "cancelled",
        slotStart: slot.startTime.toISOString(),
        slotEnd: slot.endTime.toISOString(),
        bookingId: booking.id,
      });
    }
  }

  await prisma.availabilitySlot.update({
    where: { id: slot.id },
    data: { sessionStatus: "cancelled" },
  });

  res.json({ sessionStatus: "cancelled" });
});

export default router;
