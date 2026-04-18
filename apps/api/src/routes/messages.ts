import { Router } from "express";
import { authMiddleware } from "../auth.js";
import { prisma } from "../db.js";
import { queueEmail } from "../emailQueue.js";

const router = Router();
const auth = authMiddleware();

// Build a Set of userIds the current user has a coach/athlete relationship with
// (either through CoachAthlete or a Booking history). Used to gate direct/group messaging.
async function getRelatedUserIds(currentUserId: string, candidateUserIds: string[]): Promise<Set<string>> {
  const candidates = candidateUserIds.filter((id) => id !== currentUserId);
  if (candidates.length === 0) return new Set();

  const [coachAthletes, bookings] = await Promise.all([
    prisma.coachAthlete.findMany({
      where: {
        OR: [
          { coach: { userId: currentUserId }, athlete: { userId: { in: candidates } } },
          { athlete: { userId: currentUserId }, coach: { userId: { in: candidates } } },
        ],
      },
      select: {
        coach: { select: { userId: true } },
        athlete: { select: { userId: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        OR: [
          { coach: { userId: currentUserId }, athleteProfile: { userId: { in: candidates } } },
          { athleteProfile: { userId: currentUserId }, coach: { userId: { in: candidates } } },
        ],
      },
      select: {
        coach: { select: { userId: true } },
        athleteProfile: { select: { userId: true } },
      },
    }),
  ]);

  const related = new Set<string>();
  for (const ca of coachAthletes) {
    related.add(ca.coach.userId === currentUserId ? ca.athlete.userId : ca.coach.userId);
  }
  for (const b of bookings) {
    related.add(b.coach.userId === currentUserId ? b.athleteProfile.userId : b.coach.userId);
  }
  return related;
}

// List conversations for current user
router.get("/conversations", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const participants = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    select: { conversationId: true, lastReadAt: true },
  });

  if (participants.length === 0) return res.json([]);

  const conversationIds = participants.map((p) => p.conversationId);
  const lastReadMap = new Map(participants.map((p) => [p.conversationId, p.lastReadAt]));

  const conversations = await prisma.conversation.findMany({
    where: { id: { in: conversationIds } },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Compute unread counts in parallel
  const unreadCounts = await Promise.all(
    conversations.map((c) => {
      const lastRead = lastReadMap.get(c.id);
      return prisma.message.count({
        where: {
          conversationId: c.id,
          senderUserId: { not: user.id },
          ...(lastRead ? { createdAt: { gt: lastRead } } : {}),
        },
      });
    }),
  );

  const result = conversations.map((c, i) => {
    const lastMessage = c.messages[0] ?? null;
    return {
      id: c.id,
      type: c.type,
      title: c.title,
      slotId: c.slotId,
      participants: c.participants.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
      })),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderName: lastMessage.sender.name,
            senderUserId: lastMessage.senderUserId,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
      unreadCount: unreadCounts[i],
      updatedAt: c.updatedAt.toISOString(),
    };
  });

  res.json(result);
});

// Create conversation (direct, group, or session)
router.post("/conversations", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { type, title, participantUserIds, slotId, initialMessage } = req.body as {
    type?: string;
    title?: string;
    participantUserIds?: string[];
    slotId?: string;
    initialMessage?: string;
  };

  if (!participantUserIds?.length) {
    return res.status(400).json({ error: "participantUserIds required" });
  }
  if (!initialMessage?.trim()) {
    return res.status(400).json({ error: "initialMessage required" });
  }

  // Verify the sender has a relationship with each recipient (anti-spam)
  const otherIds = participantUserIds.filter((id) => id !== user.id);
  const related = await getRelatedUserIds(user.id, otherIds);
  const unrelated = otherIds.filter((id) => !related.has(id));
  if (unrelated.length > 0) {
    return res
      .status(403)
      .json({ error: "You can only message athletes or coaches you've connected with or booked." });
  }

  const allUserIds = Array.from(new Set([user.id, ...participantUserIds]));

  // For direct conversations, dedupe to existing 1:1 thread between the two users
  if ((type === "direct" || !type) && allUserIds.length === 2) {
    const existing = await prisma.conversation.findFirst({
      where: {
        type: "direct",
        AND: allUserIds.map((uid) => ({
          participants: { some: { userId: uid } },
        })),
      },
      include: { participants: { select: { userId: true } } },
    });
    if (existing && existing.participants.length === 2) {
      const msg = await prisma.message.create({
        data: {
          conversationId: existing.id,
          senderUserId: user.id,
          content: initialMessage.trim(),
          deliveryStatus: { email: "queued" },
        },
      });
      await prisma.conversation.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });

      void notifyParticipants(existing.id, user.id, msg.id);

      return res.json({ conversationId: existing.id, messageId: msg.id });
    }
  }

  const conversation = await prisma.conversation.create({
    data: {
      type: type ?? "direct",
      title: title ?? null,
      slotId: slotId ?? null,
      participants: {
        create: allUserIds.map((uid) => ({ userId: uid })),
      },
    },
  });

  const msg = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderUserId: user.id,
      content: initialMessage.trim(),
      deliveryStatus: { email: "queued" },
    },
  });

  void notifyParticipants(conversation.id, user.id, msg.id);

  res.status(201).json({ conversationId: conversation.id, messageId: msg.id });
});

// Broadcast: send the same message individually to many recipients (creates/finds 1:1 conversations)
router.post("/broadcast", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { recipientUserIds, content } = req.body as {
    recipientUserIds?: string[];
    content?: string;
  };

  if (!recipientUserIds?.length) {
    return res.status(400).json({ error: "recipientUserIds required" });
  }
  if (!content?.trim()) {
    return res.status(400).json({ error: "content required" });
  }

  const uniqueRecipients = Array.from(new Set(recipientUserIds.filter((id) => id !== user.id)));
  const related = await getRelatedUserIds(user.id, uniqueRecipients);

  const trimmed = content.trim();
  const sent: { recipientUserId: string; conversationId: string; messageId: string }[] = [];
  const skipped: { recipientUserId: string; reason: string }[] = [];

  for (const recipientUserId of uniqueRecipients) {
    if (!related.has(recipientUserId)) {
      skipped.push({ recipientUserId, reason: "not_connected" });
      continue;
    }

    try {
      const allUserIds = [user.id, recipientUserId];
      const existing = await prisma.conversation.findFirst({
        where: {
          type: "direct",
          AND: allUserIds.map((uid) => ({
            participants: { some: { userId: uid } },
          })),
        },
        include: { participants: { select: { userId: true } } },
      });

      let conversationId: string;
      if (existing && existing.participants.length === 2) {
        conversationId = existing.id;
      } else {
        const conversation = await prisma.conversation.create({
          data: {
            type: "direct",
            participants: {
              create: allUserIds.map((uid) => ({ userId: uid })),
            },
          },
        });
        conversationId = conversation.id;
      }

      const msg = await prisma.message.create({
        data: {
          conversationId,
          senderUserId: user.id,
          content: trimmed,
          deliveryStatus: { email: "queued" },
        },
      });
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      void notifyParticipants(conversationId, user.id, msg.id);
      sent.push({ recipientUserId, conversationId, messageId: msg.id });
    } catch (err) {
      console.error("[messages] broadcast error for recipient", recipientUserId, err);
      skipped.push({ recipientUserId, reason: "error" });
    }
  }

  res.status(201).json({ sent, skipped, sentCount: sent.length, skippedCount: skipped.length });
});

// Get messages in a conversation
router.get("/conversations/:id", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: user.id } },
  });
  if (!participant) return res.status(403).json({ error: "Not a participant" });

  const conversation = await prisma.conversation.findUnique({
    where: { id: req.params.id },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  const messages = await prisma.message.findMany({
    where: {
      conversationId: req.params.id,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { sender: { select: { id: true, name: true } } },
  });

  await prisma.conversationParticipant.update({
    where: { id: participant.id },
    data: { lastReadAt: new Date() },
  });

  res.json({
    conversation: {
      id: conversation.id,
      type: conversation.type,
      title: conversation.title,
      slotId: conversation.slotId,
      participants: conversation.participants.map((p) => ({
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
      })),
    },
    messages: messages.reverse().map((m) => ({
      id: m.id,
      content: m.content,
      senderUserId: m.senderUserId,
      senderName: m.sender.name,
      createdAt: m.createdAt.toISOString(),
    })),
    hasMore: messages.length === limit,
    nextCursor: messages.length === limit ? messages[0].createdAt.toISOString() : null,
  });
});

// Send a message
router.post("/conversations/:id/messages", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: user.id } },
  });
  if (!participant) return res.status(403).json({ error: "Not a participant" });

  const { content } = req.body as { content?: string };
  if (!content?.trim()) return res.status(400).json({ error: "content required" });

  const msg = await prisma.message.create({
    data: {
      conversationId: req.params.id,
      senderUserId: user.id,
      content: content.trim(),
      deliveryStatus: { email: "queued" },
    },
    include: { sender: { select: { id: true, name: true } } },
  });

  await Promise.all([
    prisma.conversation.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    }),
    prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    }),
  ]);

  void ensureCoachAthleteFromReply(req.params.id, user.id);
  void notifyParticipants(req.params.id, user.id, msg.id);

  res.status(201).json({
    id: msg.id,
    content: msg.content,
    senderUserId: msg.senderUserId,
    senderName: msg.sender.name,
    createdAt: msg.createdAt.toISOString(),
  });
});

// Mark conversation as read
router.post("/conversations/:id/read", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: req.params.id, userId: user.id } },
  });
  if (!participant) return res.status(403).json({ error: "Not a participant" });

  await prisma.conversationParticipant.update({
    where: { id: participant.id },
    data: { lastReadAt: new Date() },
  });

  res.json({ ok: true });
});

// Total unread count (for nav badge)
router.get("/unread-count", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const participants = await prisma.conversationParticipant.findMany({
    where: { userId: user.id },
    select: { conversationId: true, lastReadAt: true },
  });

  if (participants.length === 0) return res.json({ unreadCount: 0 });

  const counts = await Promise.all(
    participants.map((p) =>
      prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderUserId: { not: user.id },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      }),
    ),
  );

  const total = counts.reduce((sum, c) => sum + c, 0);
  res.json({ unreadCount: total });
});

// Session messaging shortcut: find-or-create conversation for a session slot
router.post("/conversations/session/:slotId", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { slotId } = req.params;

  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
    include: {
      coach: { select: { userId: true, displayName: true, sports: true } },
      bookings: {
        where: { status: { not: "cancelled" } },
        include: { athleteProfile: { select: { userId: true } } },
      },
    },
  });
  if (!slot) return res.status(404).json({ error: "Slot not found" });

  if (slot.coach.userId !== user.id) {
    return res.status(403).json({ error: "Only the coach can start a session conversation" });
  }

  const existing = await prisma.conversation.findUnique({
    where: { slotId },
  });

  if (existing) {
    // Add any new participants (athletes who booked after conversation was created)
    const athleteUserIds = slot.bookings.map((b) => b.athleteProfile.userId);
    const allUserIds = [slot.coach.userId, ...athleteUserIds];
    const existingParticipants = await prisma.conversationParticipant.findMany({
      where: { conversationId: existing.id },
      select: { userId: true },
    });
    const existingUserIds = new Set(existingParticipants.map((p) => p.userId));
    const newUserIds = allUserIds.filter((uid) => !existingUserIds.has(uid));
    if (newUserIds.length > 0) {
      await prisma.conversationParticipant.createMany({
        data: newUserIds.map((uid) => ({ conversationId: existing.id, userId: uid })),
      });
    }
    return res.json({ conversationId: existing.id });
  }

  const athleteUserIds = slot.bookings.map((b) => b.athleteProfile.userId);
  const allUserIds = Array.from(new Set([slot.coach.userId, ...athleteUserIds]));

  const startStr = new Date(slot.startTime).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const sport = slot.coach.sports?.[0];
  const title = sport ? `${sport} session — ${startStr}` : `Session — ${startStr}`;

  const conversation = await prisma.conversation.create({
    data: {
      type: "session",
      title,
      slotId,
      participants: {
        create: allUserIds.map((uid) => ({ userId: uid })),
      },
    },
  });

  res.status(201).json({ conversationId: conversation.id });
});

// Find-or-create direct conversation with another user
router.post("/conversations/direct/:targetUserId", auth, async (req, res) => {
  const user = (req as { user?: { id: string } }).user;
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { targetUserId } = req.params;
  if (targetUserId === user.id) {
    return res.status(400).json({ error: "Cannot message yourself" });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, coachProfile: { select: { id: true } } },
  });
  if (!targetUser) return res.status(404).json({ error: "User not found" });

  // Athletes can always cold-message any coach (intro/inquiry surface).
  // Other directions require an existing relationship (booking or CoachAthlete).
  const currentUserRecord = await prisma.user.findUnique({
    where: { id: user.id },
    select: { athleteProfiles: { select: { id: true }, take: 1 } },
  });
  const currentIsAthlete = (currentUserRecord?.athleteProfiles.length ?? 0) > 0;
  const targetIsCoach = !!targetUser.coachProfile;

  let allowed = currentIsAthlete && targetIsCoach;
  if (!allowed) {
    const related = await getRelatedUserIds(user.id, [targetUserId]);
    allowed = related.has(targetUserId);
  }
  if (!allowed) {
    return res
      .status(403)
      .json({ error: "You can only start conversations with athletes or coaches you've connected with or booked." });
  }

  const allUserIds = [user.id, targetUserId];

  const existing = await prisma.conversation.findFirst({
    where: {
      type: "direct",
      AND: allUserIds.map((uid) => ({
        participants: { some: { userId: uid } },
      })),
    },
    include: {
      participants: { select: { userId: true } },
    },
  });

  if (existing && existing.participants.length === 2) {
    return res.json({ conversationId: existing.id });
  }

  const conversation = await prisma.conversation.create({
    data: {
      type: "direct",
      participants: {
        create: allUserIds.map((uid) => ({ userId: uid })),
      },
    },
  });

  res.status(201).json({ conversationId: conversation.id });
});

// When a coach sends a message in a 1:1 direct conversation, treat it as
// implicit acceptance and ensure the CoachAthlete relationship exists.
// Idempotent + fire-and-forget so it never blocks the message-send path.
async function ensureCoachAthleteFromReply(
  conversationId: string,
  senderUserId: string,
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        type: true,
        participants: { select: { userId: true } },
      },
    });
    if (!conversation || conversation.type !== "direct" || conversation.participants.length !== 2) return;

    const otherUserId = conversation.participants.find((p) => p.userId !== senderUserId)?.userId;
    if (!otherUserId) return;

    const [senderCoach, otherAthlete] = await Promise.all([
      prisma.coachProfile.findFirst({ where: { userId: senderUserId }, select: { id: true } }),
      prisma.athleteProfile.findFirst({ where: { userId: otherUserId }, select: { id: true } }),
    ]);
    if (!senderCoach || !otherAthlete) return;

    await prisma.coachAthlete.upsert({
      where: {
        coachProfileId_athleteProfileId: {
          coachProfileId: senderCoach.id,
          athleteProfileId: otherAthlete.id,
        },
      },
      update: {},
      create: {
        coachProfileId: senderCoach.id,
        athleteProfileId: otherAthlete.id,
        status: "active",
      },
    });
  } catch (err) {
    console.error("[messages] ensureCoachAthleteFromReply error:", err);
  }
}

// Notify other participants of a new message via email (fire-and-forget)
async function notifyParticipants(
  conversationId: string,
  senderUserId: string,
  messageId: string,
): Promise<void> {
  try {
    const [message, participants, conversation, totalParticipants] = await Promise.all([
      prisma.message.findUnique({
        where: { id: messageId },
        include: { sender: { select: { name: true } } },
      }),
      prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { not: senderUserId } },
        include: { user: { select: { email: true, name: true } } },
      }),
      prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { title: true, type: true },
      }),
      prisma.conversationParticipant.count({ where: { conversationId } }),
    ]);
    if (!message) return;

    await Promise.all(
      participants.map((p) =>
        queueEmail("new_message", {
          recipientEmail: p.user.email,
          recipientName: p.user.name,
          senderName: message.sender.name ?? "Someone",
          messagePreview: message.content.slice(0, 200),
          conversationId,
          conversationTitle: conversation?.title ?? null,
          conversationType: conversation?.type ?? null,
          totalParticipants,
        }),
      ),
    );

    await prisma.message.update({
      where: { id: messageId },
      data: { deliveryStatus: { email: "queued", queuedAt: new Date().toISOString() } },
    });
  } catch (err) {
    console.error("[messages] notifyParticipants error:", err);
  }
}

export default router;
