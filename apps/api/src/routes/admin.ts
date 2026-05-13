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

function num(value: number | null | undefined): number {
  return typeof value === "number" ? value : 0;
}

function maxDate(...dates: Array<Date | null | undefined>): string | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best ? best.toISOString() : null;
}

router.get("/coaches", async (_req: Request, res: Response) => {
  const [
    coaches,
    bookingBuckets,
    paymentSums,
    completedCounts,
    athleteCounts,
    pendingInviteCounts,
    favoriteCounts,
    reviewAggs,
    lastBookingMax,
    ruleCounts,
    slotAggs,
  ] = await Promise.all([
    prisma.coachProfile.findMany({
      include: {
        user: { select: { email: true, createdAt: true } },
        photos: { select: { id: true } },
        invite: { select: { slug: true } },
        _count: { select: { reviews: true, bookings: true } },
      },
      orderBy: { user: { createdAt: "desc" } },
    }),
    prisma.booking.groupBy({
      by: ["coachId", "status"],
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["coachId"],
      where: { paymentStatus: "succeeded" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["coachId"],
      where: { completedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.coachAthlete.groupBy({
      by: ["coachProfileId", "status"],
      _count: { _all: true },
    }),
    prisma.coachAthleteInvite.groupBy({
      by: ["coachProfileId"],
      where: { status: "invited" },
      _count: { _all: true },
    }),
    prisma.favoriteCoach.groupBy({
      by: ["coachProfileId"],
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ["coachId"],
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.booking.groupBy({
      by: ["coachId"],
      _max: { createdAt: true },
    }),
    prisma.availabilityRule.groupBy({
      by: ["coachId"],
      _count: { _all: true },
    }),
    prisma.availabilitySlot.groupBy({
      by: ["coachId"],
      _max: { startTime: true },
      _count: { _all: true },
    }),
  ]);

  const lastRuleMax = await prisma.availabilityRule.groupBy({
    by: ["coachId"],
    _max: { createdAt: true },
  });

  const bookingByCoach = new Map<string, Record<string, number>>();
  for (const b of bookingBuckets) {
    const entry = bookingByCoach.get(b.coachId) ?? {};
    entry[b.status] = b._count._all;
    bookingByCoach.set(b.coachId, entry);
  }
  const paymentByCoach = new Map(paymentSums.map((p) => [p.coachId, p]));
  const completedByCoach = new Map(completedCounts.map((c) => [c.coachId, c._count._all]));
  const athleteByCoach = new Map<string, Record<string, number>>();
  for (const a of athleteCounts) {
    const entry = athleteByCoach.get(a.coachProfileId) ?? {};
    entry[a.status] = a._count._all;
    athleteByCoach.set(a.coachProfileId, entry);
  }
  const pendingInviteByCoach = new Map(pendingInviteCounts.map((c) => [c.coachProfileId, c._count._all]));
  const favoritesByCoach = new Map(favoriteCounts.map((f) => [f.coachProfileId, f._count._all]));
  const reviewByCoach = new Map(reviewAggs.map((r) => [r.coachId, r]));
  const lastBookingByCoach = new Map(lastBookingMax.map((b) => [b.coachId, b._max.createdAt]));
  const ruleCountByCoach = new Map(ruleCounts.map((r) => [r.coachId, r._count._all]));
  const lastRuleByCoach = new Map(lastRuleMax.map((r) => [r.coachId, r._max.createdAt]));
  const slotAggByCoach = new Map(slotAggs.map((s) => [s.coachId, s]));

  const result = coaches.map((c) => {
    const hasBio = !!c.bio && c.bio.trim() !== "";
    const hasHourlyRate = c.hourlyRate !== null;
    const onboardingComplete = hasBio && hasHourlyRate;

    let credentials: Record<string, unknown> | null = null;
    if (c.credentials && typeof c.credentials === "object" && !Array.isArray(c.credentials)) {
      credentials = c.credentials as Record<string, unknown>;
    }

    const bookingBucketsForCoach = bookingByCoach.get(c.id) ?? {};
    const payment = paymentByCoach.get(c.id);
    const athleteBuckets = athleteByCoach.get(c.id) ?? {};
    const reviewAgg = reviewByCoach.get(c.id);
    const slotAgg = slotAggByCoach.get(c.id);

    const lastBookingAt = lastBookingByCoach.get(c.id) ?? null;
    const lastRuleAt = lastRuleByCoach.get(c.id) ?? null;
    const lastSlotStartAt = slotAgg?._max.startTime ?? null;
    const lastActivityAt = maxDate(lastBookingAt, lastRuleAt, lastSlotStartAt);

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
      inviteSlug: c.invite?.slug ?? null,
      kpis: {
        availabilityRules: ruleCountByCoach.get(c.id) ?? 0,
        availabilitySlots: slotAgg?._count._all ?? 0,
        lastAvailabilityAt: lastRuleAt ? lastRuleAt.toISOString() : null,
        bookingsPending: bookingBucketsForCoach["pending"] ?? 0,
        bookingsConfirmed: bookingBucketsForCoach["confirmed"] ?? 0,
        bookingsCompleted: completedByCoach.get(c.id) ?? 0,
        bookingsCancelled:
          (bookingBucketsForCoach["cancelled"] ?? 0) + (bookingBucketsForCoach["declined"] ?? 0),
        paymentsSucceededCents: num(payment?._sum.amountCents),
        paymentsSucceededCount: payment?._count._all ?? 0,
        athletesActive: athleteBuckets["active"] ?? 0,
        athletesPending:
          (athleteBuckets["pending"] ?? 0) + (pendingInviteByCoach.get(c.id) ?? 0),
        favorites: favoritesByCoach.get(c.id) ?? 0,
        reviews: reviewAgg?._count._all ?? c._count.reviews,
        avgRating: reviewAgg?._avg.rating ?? null,
        lastBookingAt: lastBookingAt ? lastBookingAt.toISOString() : null,
        lastActivityAt,
      },
    };
  });

  res.json(result);
});

router.get("/coaches/:id", async (req: Request, res: Response) => {
  const coachId = req.params.id;
  const coach = await prisma.coachProfile.findUnique({
    where: { id: coachId },
    include: {
      user: { select: { id: true, email: true, createdAt: true } },
      photos: { select: { id: true, url: true } },
      invite: { select: { slug: true } },
      _count: { select: { reviews: true, bookings: true } },
    },
  });
  if (!coach) {
    res.status(404).json({ error: "Coach not found" });
    return;
  }

  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setHours(0, 0, 0, 0);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfThisWeek.getDay());
  const eightWeeksOut = new Date(startOfThisWeek.getTime() + 8 * 7 * 24 * 60 * 60 * 1000);

  const [
    bookingBuckets,
    paymentSum,
    completedCount,
    athleteBuckets,
    pendingInviteCount,
    favoriteCount,
    reviewAgg,
    lastBookingMax,
    ruleCount,
    lastRuleMax,
    slotAgg,
    upcomingSlotCount,
    pastSlotCount,
    recentBookings,
    recentAthletes,
    recentPendingInvites,
    messagesSent,
    lastMessageAt,
    bookingsByMonth,
    paymentsByMonth,
    availabilityAddedByDay,
    slotsByWeek,
    rulesAddedLast30,
    slotsAddedLast30,
  ] = await Promise.all([
    prisma.booking.groupBy({
      by: ["status"],
      where: { coachId },
      _count: { _all: true },
    }),
    prisma.booking.aggregate({
      where: { coachId, paymentStatus: "succeeded" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.booking.count({ where: { coachId, completedAt: { not: null } } }),
    prisma.coachAthlete.groupBy({
      by: ["status"],
      where: { coachProfileId: coachId },
      _count: { _all: true },
    }),
    prisma.coachAthleteInvite.count({
      where: { coachProfileId: coachId, status: "invited" },
    }),
    prisma.favoriteCoach.count({ where: { coachProfileId: coachId } }),
    prisma.review.aggregate({
      where: { coachId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.booking.aggregate({
      where: { coachId },
      _max: { createdAt: true },
    }),
    prisma.availabilityRule.count({ where: { coachId } }),
    prisma.availabilityRule.aggregate({
      where: { coachId },
      _max: { createdAt: true },
    }),
    prisma.availabilitySlot.aggregate({
      where: { coachId },
      _max: { startTime: true },
      _count: { _all: true },
    }),
    prisma.availabilitySlot.count({ where: { coachId, startTime: { gt: now } } }),
    prisma.availabilitySlot.count({ where: { coachId, startTime: { lte: now } } }),
    prisma.booking.findMany({
      where: { coachId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        amountCents: true,
        paymentStatus: true,
        createdAt: true,
        completedAt: true,
        groupSize: true,
        athleteProfile: { select: { id: true, displayName: true } },
      },
    }),
    prisma.coachAthlete.findMany({
      where: { coachProfileId: coachId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        createdAt: true,
        athlete: { select: { id: true, displayName: true } },
      },
    }),
    prisma.coachAthleteInvite.findMany({
      where: { coachProfileId: coachId, status: "invited" },
      orderBy: { invitedAt: "desc" },
      take: 10,
      select: {
        id: true,
        athleteName: true,
        athleteEmail: true,
        invitedAt: true,
        status: true,
      },
    }),
    prisma.message.count({ where: { senderUserId: coach.user.id } }),
    prisma.message.aggregate({
      where: { senderUserId: coach.user.id },
      _max: { createdAt: true },
    }),
    prisma.$queryRaw<Array<{ month: Date; count: bigint }>>`
      SELECT date_trunc('month', created_at) AS month, COUNT(*)::bigint AS count
      FROM bookings
      WHERE coach_id = ${coachId} AND created_at >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ month: Date; total: bigint | null; count: bigint }>>`
      SELECT date_trunc('month', created_at) AS month,
             COALESCE(SUM(amount_cents), 0)::bigint AS total,
             COUNT(*)::bigint AS count
      FROM bookings
      WHERE coach_id = ${coachId}
        AND payment_status = 'succeeded'
        AND created_at >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ day: Date; rules: bigint; slots: bigint }>>`
      SELECT date_trunc('day', LEAST(r.created_at, NOW())) AS day,
             COUNT(DISTINCT r.id)::bigint AS rules,
             COUNT(s.id)::bigint AS slots
      FROM availability_rules r
      LEFT JOIN availability_slots s ON s.rule_id = r.id
      WHERE r.coach_id = ${coachId}
        AND r.created_at >= ${ninetyDaysAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.$queryRaw<Array<{ week: Date; count: bigint }>>`
      SELECT date_trunc('week', start_time) AS week,
             COUNT(*)::bigint AS count
      FROM availability_slots
      WHERE coach_id = ${coachId}
        AND start_time >= ${startOfThisWeek}
        AND start_time < ${eightWeeksOut}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    prisma.availabilityRule.count({
      where: { coachId, createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(s.id)::bigint AS count
      FROM availability_slots s
      JOIN availability_rules r ON s.rule_id = r.id
      WHERE s.coach_id = ${coachId}
        AND r.created_at >= ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)}
    `,
  ]);

  const bookingByStatus: Record<string, number> = {};
  for (const b of bookingBuckets) bookingByStatus[b.status] = b._count._all;

  const athleteByStatus: Record<string, number> = {};
  for (const a of athleteBuckets) athleteByStatus[a.status] = a._count._all;

  const lastActivityAt = maxDate(
    lastBookingMax._max.createdAt,
    lastRuleMax._max.createdAt,
    slotAgg._max.startTime,
    lastMessageAt._max.createdAt,
  );

  const appUrl = process.env.APP_URL ?? process.env.FRONTEND_URL ?? "";
  const inviteUrl = coach.invite?.slug
    ? `${appUrl.replace(/\/$/, "")}/coaches/${coach.invite.slug}`
    : null;

  const hasBio = !!coach.bio && coach.bio.trim() !== "";
  const hasHourlyRate = coach.hourlyRate !== null;
  const onboardingComplete = hasBio && hasHourlyRate;

  let credentials: Record<string, unknown> | null = null;
  if (coach.credentials && typeof coach.credentials === "object" && !Array.isArray(coach.credentials)) {
    credentials = coach.credentials as Record<string, unknown>;
  }

  res.json({
    id: coach.id,
    displayName: coach.displayName,
    email: coach.user.email,
    sports: coach.sports,
    serviceCities: coach.serviceCities,
    createdAt: coach.user.createdAt,
    hasProfile: true,
    hasHourlyRate,
    hasBio,
    isVerified: coach.verified,
    hasStripe: coach.stripeOnboardingComplete,
    onboardingComplete,
    bio: coach.bio || null,
    hourlyRate: coach.hourlyRate?.toString() ?? null,
    phone: coach.phone ?? null,
    credentials,
    avatarUrl: coach.avatarUrl ?? null,
    photos: coach.photos,
    photoCount: coach.photos.length,
    inviteSlug: coach.invite?.slug ?? null,
    inviteUrl,
    kpis: {
      availabilityRules: ruleCount,
      availabilitySlots: slotAgg._count._all,
      upcomingSlots: upcomingSlotCount,
      pastSlots: pastSlotCount,
      lastAvailabilityAt: lastRuleMax._max.createdAt
        ? lastRuleMax._max.createdAt.toISOString()
        : null,
      rulesAddedLast30Days: rulesAddedLast30,
      slotsAddedLast30Days: Number(slotsAddedLast30[0]?.count ?? 0n),
      bookingsPending: bookingByStatus["pending"] ?? 0,
      bookingsConfirmed: bookingByStatus["confirmed"] ?? 0,
      bookingsCompleted: completedCount,
      bookingsCancelled:
        (bookingByStatus["cancelled"] ?? 0) + (bookingByStatus["declined"] ?? 0),
      bookingsTotal: Object.values(bookingByStatus).reduce((a, b) => a + b, 0),
      paymentsSucceededCents: num(paymentSum._sum.amountCents),
      paymentsSucceededCount: paymentSum._count._all,
      athletesActive: athleteByStatus["active"] ?? 0,
      athletesPending: (athleteByStatus["pending"] ?? 0) + pendingInviteCount,
      athletePendingEmailInvites: pendingInviteCount,
      favorites: favoriteCount,
      reviews: reviewAgg._count._all,
      avgRating: reviewAgg._avg.rating ?? null,
      messagesSent,
      lastBookingAt: lastBookingMax._max.createdAt
        ? lastBookingMax._max.createdAt.toISOString()
        : null,
      lastMessageAt: lastMessageAt._max.createdAt
        ? lastMessageAt._max.createdAt.toISOString()
        : null,
      lastActivityAt,
    },
    timeseries: {
      bookingsByMonth: bookingsByMonth.map((row) => ({
        month: row.month.toISOString(),
        count: Number(row.count),
      })),
      paymentsByMonth: paymentsByMonth.map((row) => ({
        month: row.month.toISOString(),
        totalCents: Number(row.total ?? 0n),
        count: Number(row.count),
      })),
      availabilityAddedByDay: availabilityAddedByDay.map((row) => ({
        day: row.day.toISOString(),
        rules: Number(row.rules),
        slots: Number(row.slots),
      })),
      slotsByWeek: slotsByWeek.map((row) => ({
        week: row.week.toISOString(),
        count: Number(row.count),
      })),
    },
    recentBookings: recentBookings.map((b) => ({
      id: b.id,
      status: b.status,
      amountCents: b.amountCents,
      paymentStatus: b.paymentStatus,
      createdAt: b.createdAt.toISOString(),
      completedAt: b.completedAt ? b.completedAt.toISOString() : null,
      groupSize: b.groupSize,
      athlete: b.athleteProfile
        ? { id: b.athleteProfile.id, displayName: b.athleteProfile.displayName }
        : null,
    })),
    recentAthletes: recentAthletes.map((a) => ({
      id: a.id,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      athlete: a.athlete
        ? { id: a.athlete.id, displayName: a.athlete.displayName }
        : null,
    })),
    recentPendingInvites: recentPendingInvites.map((i) => ({
      id: i.id,
      athleteName: i.athleteName,
      athleteEmail: i.athleteEmail,
      invitedAt: i.invitedAt.toISOString(),
      status: i.status,
    })),
  });
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
