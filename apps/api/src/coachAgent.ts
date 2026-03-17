/**
 * Coach assistant agent: handles messages from athlete or coach, can use
 * get_coach_availability tool. Uses Bedrock Converse API directly (no AI SDK).
 * Later: can be swapped for InvokeAgentRuntime to an AgentCore-deployed agent.
 */

import {
  ConverseCommand,
  type ConverseCommandOutput,
  type Message,
  type ContentBlock,
  type SystemContentBlock,
  type ToolConfiguration,
  type ToolUseBlock,
  type ToolResultBlock,
} from "@aws-sdk/client-bedrock-runtime";
import { getBedrockRuntimeClient, BEDROCK_MODEL_ID } from "./bedrock.js";
import { prisma } from "./db.js";
import { sendCoachInviteToBookSlot } from "./notifications.js";
import { isStripeEnabled } from "./stripe.js";
import {
  DEFAULT_COACH_TIMEZONE,
  formatInCoachTz,
  getCoachTodayString,
  parseCoachLocalToUtc,
  toCoachLocalISOString,
} from "./timezone.js";

export type AgentChatRole = "athlete" | "coach";

export interface AgentChatPayload {
  role: AgentChatRole;
  message: string;
  coachId: string;
  threadId?: string;
  /** When role is "athlete", the athlete's user id (for booking and future SMS). Required for book_slot. */
  athleteId?: string;
  /** Coach's display name; used in the system prompt so the agent can address the coach and use the coach's name when replying to athletes. */
  coachDisplayName?: string;
}

export interface AgentChatResult {
  agentReplyToSender: string;
  toCoach: string | null;
  toAthlete: string | null;
  thinking: string[];
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
}

function getSystemPrompt(coachDisplayName?: string): string {
  const coachNameLine =
    coachDisplayName?.trim()
      ? `The coach's display name is: ${coachDisplayName.trim()}. When replying to [Athlete], use this name when appropriate (e.g. "Here are ${coachDisplayName.trim()}'s open times," "I've booked you with ${coachDisplayName.trim()} for Tuesday").`
      : "When replying to [Athlete], refer to the coach in third person as \"the coach\" or use first person as the coach (\"my open times\") when appropriate.";

  return `You are the coach's assistant. You handle athlete and parent inquiries on behalf of the coach, and you help the coach manage their schedule and bookings. Every message you receive is prefixed with [Athlete]: or [Coach]: so you always know who is speaking.

## How to address the coach and the athlete

**When the message is from [Coach] (you are replying to the coach):**
- Always address the coach in the second person. Use "your" and "you" (e.g. "your availability," "your schedule," "you don't have a slot at that time," "your closest open slot is…").
- Never say "the coach" or "the coach's" when talking to the coach. Wrong: "The coach's current availability…" or "I couldn't find a slot for the coach." Right: "Your current availability…" or "You don't have a slot at that time."

**When the message is from [Athlete] (you are replying to the athlete or parent):**
- You are speaking as the coach. Use the coach's name when it fits naturally so the athlete knows who they're booking with.
- ${coachNameLine}

## Your role by sender

**When the message is from [Athlete]:** (or a parent messaging for their kid)
- You are speaking on behalf of the coach. You are the coach's voice: friendly, professional, and helpful.
- Do not say "I'll ask the coach" for things you can do yourself (check availability, book a session). Use the tools, then respond as the coach would: e.g. "Here are my open times…" or "You're all set for Tuesday at 3pm. I'll confirm in the app."
- Never mention internal IDs, the pipe (|), or technical details. Use only human‑readable dates and times (e.g. "Tuesday, Mar 4 at 3:00 PM").
- If an athlete or parent asks something the coach should know (e.g. "I might be a few minutes late," "Can we do outdoors instead?"), relay it at the end of your reply with: RELAY_TO_COACH: <short message>.

**When the message is from [Coach]:**
- You are their assistant. Help them with schedule, availability, and booking. Always use "you" and "your" when referring to the coach (e.g. "I've added that slot for you," "Here’s your availability"); never "the coach" or "the coach's."
- When the coach refers to an athlete by name, you must call find_athlete and use the athleteId from that result in book_slot (exact uuid after "athleteId:"); never omit athleteId or the wrong person may be booked. Never tell the coach or anyone internal athleteIds.

- **Booking flow — "book [athlete] at [time] [day]" (e.g. "book Brent for saturday at 11am"):**
  - **Always use the exact time the coach asked for.** If the coach says "Saturday at 11am", you must only book or create a slot at 11:00 AM on that Saturday. Never book or suggest a different time (e.g. 9am or 3pm). If there is no slot at the requested time, you add a new slot at that time (after confirmation) and send the invite to that slot.
  - **Step 1:** Call get_coach_availability and find_athlete (with the athlete name). Use "Today's date" from the first line to resolve the day (e.g. "saturday" → that week's Saturday). The requested time (e.g. 11am) means 11:00 AM—match only a slot that shows 11:00 AM on that day.
  - **Step 2 — Slot exists at that time:** If the list has a slot at that exact date and time (e.g. Saturday 11:00 AM), call **only** book_slot with that slot's startTime (the ISO after the pipe) and the athleteId. Do not call add_slot. Tell the coach you sent the athlete an invite to complete the booking via the link.
  - **Step 3 — No slot at that time:** If there is no slot at the requested date and time, **do not** book a different time. Ask **one** question: e.g. "You don't have a slot [day] at [time]. Should I add that slot and send [athlete name] an invite to book?" Then **wait for the coach's reply**.
  - **Step 4 — After confirmation:** Only after the coach confirms, call add_slot with the startTime for the **requested** day and time (e.g. Saturday 11am → that date at 11:00:00 in coach timezone), then immediately call book_slot with the **same** startTime and the athleteId. Tell the coach you added the slot and sent the invite.

- Only say you created or added a slot if the add_slot tool returns a message that starts with "Created". If it returns an error (overlap, invalid time), tell the coach that exact error; do not claim success.
- When the coach asks to book an athlete for a time, the system does not create a booking record; it sends the athlete an email with a link to complete the booking (and pay if required) on the site. When book_slot returns "Invitation sent": if the slot already existed, say you sent the athlete an invite to complete the booking via the link; if you just added a slot and sent the invite, say you added the slot and sent [athlete name] an invite to complete the booking on the site. Do not say you "booked" them—say invite. For any other tool message (e.g. "No slot found", "not linked"), report that exact error; do not claim success.

## Tools and accuracy

- When asked about the coach's schedule or availability, use get_coach_availability. The first line gives the current date and time in the coach's timezone and "Today's date" as a reference (YYYY-MM-DD). Use that reference for any relative date the coach says: today, tomorrow, this Friday, this Saturday, next Monday, etc. Compute the correct date from that reference; do not use a date from the list of existing slots when adding a new slot. Send startTime in coach timezone as ISO without Z (e.g. 2025-03-07T17:00:00 for 5pm); the system converts to UTC.
- All slot times in get_coach_availability are in coach timezone. The time after the pipe is coach-local ISO (e.g. 2025-03-11T09:00:00 for 9am). Use that string exactly in book_slot.
- **Use existing slots first:** Before calling add_slot, always check the get_coach_availability output. If a slot at that date and time is already listed, use book_slot with that slot's startTime (the ISO after the pipe); do not add a new slot. Only call add_slot when no slot exists at that time (and the coach has confirmed they want to add it).
- **Matching day and time:** Use only the exact time the coach requested. "Saturday at 11am" means the slot that shows "11:00 AM" on that Saturday—not 9:00 AM, not 3:00 PM. If no slot shows 11:00 AM on that day, do not book any other time; ask to add a slot at 11am and send the invite (then add_slot + book_slot at 11am after they confirm). Never book or create a slot at a different time than the coach asked for.
- Only state availability, bookings, or slot creation that the tools actually returned. Do not make up times or confirmations.

## Tone and user experience

- After every tool use (availability, find athlete, book slot, add slot), always reply with a short confirmation to the user. Never leave your reply blank after calling tools—e.g. say "Done. I've requested that booking" or "I've sent them an invite to complete the booking" or report the exact error if a tool failed.
- Be concise and warm. Short replies are better than long ones unless the person asked for detail.
- For athletes: confirm what you did and set expectations (e.g. "You're booked for Tuesday at 3pm. The coach will confirm in the app.").
- For coaches: confirm actions and, when relevant, remind them of next steps (e.g. "Done. You can confirm the booking in the app when you're ready.").
- If you cannot do something (e.g. athlete not found), say so clearly and suggest what they can do. When the coach asks to book at a time that has no slot, confirm before creating (e.g. "You don't have a slot then. Should I add [that day] at [that time] and send [name] an invite to book?"). Never book them for a different time than requested—only the exact time the coach said. When talking to the athlete use first person or the coach's name; athletes cannot create slots, so only offer existing availability.
- Do not promise things outside your role (e.g. refunds, detailed payment or cancellation policy) unless you are sure; suggest they check the app or contact support if needed.

## Relaying between coach and athlete

- To pass a note to the coach, end your reply with exactly: RELAY_TO_COACH: <message>
- To pass a note to the athlete, end your reply with exactly: RELAY_TO_ATHLETE: <message>
- Omit these lines if there is nothing to relay. Only one line of each type per reply.`;
}

const COACH_AGENT_TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: "get_coach_availability",
        description:
          "Get the coach's current availability (upcoming slots and recurring rules). Use this when the athlete or coach asks about schedule, when they're free, or booking times. Describe slots to the user by date and time only; never mention internal IDs.",
        inputSchema: {
          json: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      },
    },
    {
      toolSpec: {
        name: "find_athlete",
        description:
          "Find athletes connected to this coach by name. Use when the coach refers to an athlete by name (e.g. 'book Brent for Monday 2pm'). Only the coach can use this. Returns lines like 'Name | athleteId: <uuid>'. If the search returns 'No connected athlete found matching X' followed by a list of connected athletes, use the display name and athleteId from the list (pick the best match or ask the coach which one). You must pass the exact uuid as athleteId in book_slot—do not call book_slot without athleteId when the coach asked to book someone by name.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              nameContains: { type: "string", description: "Optional: filter by name (e.g. 'Maceo'). Leave empty to list all connected athletes." },
            },
            additionalProperties: false,
          },
        },
      },
    },
    {
      toolSpec: {
        name: "book_slot",
        description:
          "Reserve a slot for an athlete by sending them an email with a link to complete the booking (and pay if required) on the site. This does not create a booking record—the athlete completes it via the link. Always use the exact time the coach requested: pass that slot's startTime (from get_coach_availability, the ISO after the pipe). Never book a different time (e.g. if they said 11am, do not pass 9am or 3pm). When the coach is booking for someone by name, pass athleteId from find_athlete. If no slot exists at the requested time, ask the coach to confirm, then call add_slot at that time and book_slot with the same startTime. The tool returns 'Invitation sent' when the athlete was emailed. For errors report the tool's message.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              startTime: { type: "string", description: "Slot start time in ISO 8601 format (e.g. 2025-03-04T15:00:00.000Z)" },
              athleteId: { type: "string", description: "Required when coach is booking for a named athlete. Use the uuid from find_athlete (after 'athleteId:'). Do not omit—without it the wrong person may be booked." },
              message: { type: "string", description: "Optional note for the coach" },
            },
            required: ["startTime"],
            additionalProperties: false,
          },
        },
      },
    },
    {
      toolSpec: {
        name: "add_slot",
        description:
          "Create a new availability slot only when no slot exists at that date and time. First check get_coach_availability: if a slot at that time is already listed, do NOT call add_slot — use book_slot with that existing slot instead. Do not call this until the coach has confirmed they want to add the slot and send the invite (e.g. after you asked 'Should I add that slot and send [name] an invite?' and they said yes). Only then use add_slot, then immediately call book_slot with the same startTime. The system will reject creation if a slot already exists or overlaps. get_coach_availability gives 'Today's date' (YYYY-MM-DD); compute the slot date from that and send startTime in coach timezone as ISO without Z (e.g. 2025-03-07T17:00:00).",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              startTime: {
                type: "string",
                description: "Slot start in coach timezone as ISO without Z. Derive the date from the 'Today's date' reference and the coach's words (today, tomorrow, this Friday, this Saturday, next Monday, etc.); add the time (e.g. 9a → 09:00, 5pm → 17:00). Example: 2025-03-07T17:00:00.",
              },
              durationMinutes: {
                type: "number",
                description: "Length of the slot in minutes (default 60 if omitted).",
              },
            },
            required: ["startTime"],
            additionalProperties: false,
          },
        },
      },
    },
  ],
};

/**
 * Fetch availability summary for a coach (used by the agent tool).
 */
export async function getCoachAvailabilitySummary(coachId: string): Promise<string> {
  const [rules, oneOffSlots] = await Promise.all([
    prisma.availabilityRule.findMany({
      where: { coachId },
      include: {
        slots: {
          where: { startTime: { gte: new Date() } },
          orderBy: { startTime: "asc" },
          take: 30,
        },
      },
      orderBy: { firstStartTime: "asc" },
    }),
    prisma.availabilitySlot.findMany({
      where: { coachId, ruleId: null, startTime: { gte: new Date() } },
      orderBy: { startTime: "asc" },
      take: 20,
    }),
  ]);

  const parts: string[] = [];
  const now = new Date();
  const todayStr = getCoachTodayString();
  const nowInTz = formatInCoachTz(now);
  parts.push(
    `Current date and time in coach timezone (${DEFAULT_COACH_TIMEZONE}): ${nowInTz}. Today's date (use as reference for relative days): ${todayStr}.`
  );
  parts.push(
    "Slots below use coach-local time (no UTC). Use the time after the pipe in book_slot exactly as shown."
  );

  for (const r of rules) {
    const slots = r.slots ?? [];
    for (const s of slots) {
      const start = s.startTime;
      const end = s.endTime;
      const startFmt = formatInCoachTz(start);
      const endFmt = formatInCoachTz(end, { hour: "numeric", minute: "2-digit" });
      const startCoachLocal = toCoachLocalISOString(start);
      parts.push(`${startFmt} - ${endFmt} (${s.status}, recurring ${r.recurrence}) | ${startCoachLocal}`);
    }
  }

  for (const s of oneOffSlots) {
    const start = s.startTime;
    const end = s.endTime;
    const startFmt = formatInCoachTz(start);
    const endFmt = formatInCoachTz(end, { hour: "numeric", minute: "2-digit" });
    const startCoachLocal = toCoachLocalISOString(start);
    parts.push(`${startFmt} - ${endFmt} (${s.status}, one-off) | ${startCoachLocal}`);
  }

  if (parts.length === 0) return "No upcoming availability on the schedule.";
  return parts.join("\n");
}

/**
 * List athletes connected to this coach (for the agent to resolve names like "Maceo").
 * Returns displayName and athleteId (AthleteProfile.id) so the model can pass athleteId to book_slot.
 */
export async function getConnectedAthletesForCoach(
  coachId: string,
  nameContains?: string
): Promise<string> {
  const filter = nameContains?.trim();
  const list = await prisma.coachAthlete.findMany({
    where: {
      coachProfileId: coachId,
      status: "active",
      ...(filter
        ? { athlete: { displayName: { contains: filter, mode: "insensitive" as const } } }
        : {}),
    },
    include: { athlete: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (list.length === 0) {
    if (filter) {
      const all = await prisma.coachAthlete.findMany({
        where: { coachProfileId: coachId, status: "active" },
        include: { athlete: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
      });
      if (all.length === 0) {
        return "No connected athletes yet. Athletes appear here after they sign up via your invite link.";
      }
      const lines = all.map((ca) => `${ca.athlete.displayName} | athleteId: ${ca.athlete.id}`);
      return `No connected athlete found matching "${filter}". Your connected athletes:\n${lines.join("\n")}\nUse the exact display name or the athleteId from the list above when booking.`;
    }
    return "No connected athletes yet. Athletes appear here after they sign up via your invite link.";
  }

  const lines = list.map(
    (ca) => `${ca.athlete.displayName} | athleteId: ${ca.athlete.id}`
  );
  return lines.join("\n");
}

/**
 * Create a booking for an athlete (agent-initiated) by slot start time. Validates athlete is linked to coach via CoachAthlete.
 * Does not create Stripe payment; booking is pending until coach confirms.
 */
export async function createBookingForAthlete(
  coachId: string,
  athleteProfileId: string,
  startTimeIso: string,
  message?: string
): Promise<string> {
  const link = await prisma.coachAthlete.findFirst({
    where: { coachProfileId: coachId, athleteProfileId, status: "active" },
  });
  if (!link) {
    return "This athlete is not linked to this coach. Only connected athletes can book.";
  }

  let requestedStart: Date;
  try {
    requestedStart = parseCoachLocalToUtc(startTimeIso);
  } catch {
    return "Invalid start time. Use ISO format (e.g. 2025-03-07T15:00:00 for 3pm coach time, or exact time from availability with Z).";
  }
  if (Number.isNaN(requestedStart.getTime())) {
    return "Invalid start time. Use ISO format (e.g. 2025-03-07T15:00:00 or 2025-03-04T15:00:00.000Z).";
  }

  const windowMs = 2 * 60 * 1000;
  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      coachId,
      startTime: {
        gte: new Date(requestedStart.getTime() - windowMs),
        lte: new Date(requestedStart.getTime() + windowMs),
      },
    },
    include: { coach: { select: { displayName: true, hourlyRate: true, stripeConnectAccountId: true } } },
  });
  if (!slot) return "No slot found for that date and time. Check availability and use the exact start time.";
  if (slot.status !== "available") return `That slot is not available (status: ${slot.status}).`;

  const slotId = slot.id;
  const existing = await prisma.booking.findFirst({
    where: { slotId, athleteProfileId, status: { not: "cancelled" } },
  });
  if (existing) return "This athlete already has a pending or confirmed request for this slot.";

  const confirmed = await prisma.booking.findFirst({
    where: { slotId, status: "confirmed" },
  });
  if (confirmed) return "This slot is already booked by someone else.";

  const athleteProfile = await prisma.athleteProfile.findUnique({
    where: { id: athleteProfileId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!athleteProfile?.user.email) return "Athlete email not found; cannot send booking link.";

  const slotStart = slot.startTime.toISOString();
  const slotEnd = slot.endTime.toISOString();
  const coachName = slot.coach.displayName;

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const bookingUrl = appUrl ? `${appUrl}/book/${coachId}/${slotId}` : "";
  sendCoachInviteToBookSlot({
    athleteEmail: athleteProfile.user.email,
    athleteName: athleteProfile.user.name ?? null,
    coachDisplayName: coachName,
    slotStart,
    slotEnd,
    bookingUrl,
  }).catch((err) => console.error("[coachAgent] sendCoachInviteToBookSlot failed:", err));

  const start = slotStart.slice(0, 16);
  const end = slotEnd.slice(11, 16);
  const hourlyRate = slot.coach.hourlyRate ? Number(slot.coach.hourlyRate) : null;
  const needsPayment =
    isStripeEnabled() &&
    hourlyRate != null &&
    hourlyRate > 0 &&
    !!slot.coach.stripeConnectAccountId;

  if (needsPayment) {
    return `Invitation sent to the athlete with a link to complete the booking (${start} – ${end}). They’ll pay when they complete it on the site. No booking record until they do.`;
  }
  return `Invitation sent to the athlete with a link to complete the booking (${start} – ${end}). No booking record until they confirm on the site.`;
}

/**
 * Create a new one-off availability slot for a coach.
 */
export async function createAvailabilitySlotForCoach(
  coachId: string,
  startTimeIso: string,
  durationMinutes?: number
): Promise<string> {
  let start: Date;
  try {
    start = parseCoachLocalToUtc(startTimeIso);
  } catch {
    return "Invalid start time. Use ISO format (e.g. 2025-03-07T19:00:00 for 7pm in coach timezone, or 2025-03-04T15:00:00.000Z for UTC).";
  }
  if (Number.isNaN(start.getTime())) {
    return "Invalid start time. Use ISO format (e.g. 2025-03-07T19:00:00 for 7pm in coach timezone).";
  }

  const duration = Number.isFinite(durationMinutes as number) && (durationMinutes as number) > 0 ? (durationMinutes as number) : 60;
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const windowMs = 2 * 60 * 1000;
  const existingAtSameTime = await prisma.availabilitySlot.findFirst({
    where: {
      coachId,
      startTime: {
        gte: new Date(start.getTime() - windowMs),
        lte: new Date(start.getTime() + windowMs),
      },
    },
  });
  if (existingAtSameTime) {
    return "You already have a slot at this date and time. Use that existing slot to book the athlete (call book_slot with that slot's startTime from get_coach_availability); do not create a duplicate.";
  }

  const overlapping = await prisma.availabilitySlot.findFirst({
    where: {
      coachId,
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (overlapping) {
    return "You already have an availability slot that overlaps this time. Use the existing slot or choose a different time.";
  }

  const slot = await prisma.availabilitySlot.create({
    data: {
      coachId,
      ruleId: null,
      startTime: start,
      endTime: end,
      recurrence: "none",
      status: "available",
    },
  });

  const startLabel = formatInCoachTz(start);
  const endLabel = formatInCoachTz(end, { hour: "numeric", minute: "2-digit" });
  return `Created a new available slot on ${startLabel} - ${endLabel}. (Internal id ${slot.id}).`;
}

function parseStructuredReply(text: string): { replyToSender: string; toCoach: string | null; toAthlete: string | null } {
  let replyToSender = text.trim();
  let toCoach: string | null = null;
  let toAthlete: string | null = null;

  const relayToCoach = /RELAY_TO_COACH:\s*(.+?)(?=\n|RELAY_|$)/gis;
  const relayToAthlete = /RELAY_TO_ATHLETE:\s*(.+?)(?=\n|RELAY_|$)/gis;

  const matchCoach = replyToSender.match(relayToCoach);
  const matchAthlete = replyToSender.match(relayToAthlete);

  if (matchCoach) {
    toCoach = matchCoach.map((m) => m.replace(/RELAY_TO_COACH:\s*/i, "").trim()).join(" ");
    replyToSender = replyToSender.replace(relayToCoach, "").trim();
  }
  if (matchAthlete) {
    toAthlete = matchAthlete.map((m) => m.replace(/RELAY_TO_ATHLETE:\s*/i, "").trim()).join(" ");
    replyToSender = replyToSender.replace(relayToAthlete, "").trim();
  }

  replyToSender = replyToSender.replace(/\n{2,}/g, "\n").trim();
  return { replyToSender, toCoach, toAthlete };
}

/**
 * In-memory conversation history per thread (for in-process agent).
 * Key: threadId (or "default"), value: array of { role, content } for the model.
 */
const conversationStore = new Map<string, Array<{ role: "user" | "assistant" | "system"; content: string }>>();
const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 5;

function getOrCreateHistory(threadId: string): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  let h = conversationStore.get(threadId);
  if (!h) {
    h = [];
    conversationStore.set(threadId, h);
  }
  return h;
}

function appendToHistory(
  threadId: string,
  userContent: string,
  assistantContent: string
) {
  const h = getOrCreateHistory(threadId);
  h.push({ role: "user", content: userContent });
  h.push({ role: "assistant", content: assistantContent });
  while (h.length > MAX_HISTORY) h.splice(0, 2);
}

function toBedrockMessages(history: Array<{ role: "user" | "assistant"; content: string }>): Message[] {
  return history.map((m) => ({
    role: m.role,
    content: [{ text: m.content.trim() || " " }] as ContentBlock[],
  }));
}

function getTextFromContent(content: ContentBlock[] | undefined): string {
  if (!content) return "";
  return content
    .map((block) => ("text" in block && block.text ? block.text : ""))
    .filter(Boolean)
    .join("");
}

function getToolUseBlocks(content: ContentBlock[] | undefined): ToolUseBlock[] {
  if (!content) return [];
  return content
    .map((block) => ("toolUse" in block ? block.toolUse : null))
    .filter((b): b is ToolUseBlock => b != null);
}

/** Parse athleteId from find_athlete result when unambiguous (single line or single match). */
function parseAthleteIdFromFindResult(result: string): string | undefined {
  const trimmed = result.trim();
  if (!trimmed || trimmed.startsWith("No connected")) return undefined;
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  const uuidRe = /athleteId:\s*([a-f0-9-]{36})/i;
  const matches = lines.map((line) => line.match(uuidRe)).filter(Boolean) as RegExpMatchArray[];
  if (matches.length === 1) return matches[0][1];
  if (matches.length > 1 && lines.length === 1) return matches[0][1];
  return undefined;
}

/** Bedrock rejects content blocks with blank text. Ensure no text block is empty. */
function sanitizeContentBlocks(content: ContentBlock[]): ContentBlock[] {
  return content.map((block) => {
    if ("text" in block && typeof block.text === "string" && block.text.trim() === "") {
      return { ...block, text: " " };
    }
    return block;
  });
}

/** Ensure assistant message has no blank text in content (Bedrock requirement). */
function sanitizeAssistantMessage(message: Message): Message {
  const content = message.content ?? [];
  if (content.length === 0) return message;
  const sanitized = sanitizeContentBlocks(content);
  if (sanitized === content) return message;
  return { ...message, content: sanitized };
}

/**
 * Invoke the coach assistant agent using Bedrock Converse API with tool use.
 */
export async function invokeCoachAgent(
  payload: AgentChatPayload,
  existingMessages?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AgentChatResult> {
  const { role, message, coachId, threadId = "default", coachDisplayName } = payload;

  const userLabel = role === "athlete" ? "Athlete" : "Coach";
  const userContent = `[${userLabel}]: ${message}`;

  const thinking: string[] = [];
  const toolCallsList: Array<{ name: string; input: unknown; result: unknown }> = [];

  const history =
    existingMessages && existingMessages.length > 0
      ? existingMessages
      : (getOrCreateHistory(threadId).filter((m) => m.role !== "system") as Array<{
          role: "user" | "assistant";
          content: string;
        }>);

  let messages: Message[] = [
    ...toBedrockMessages(history),
    { role: "user" as const, content: [{ text: userContent }] as ContentBlock[] },
  ];

  const client = getBedrockRuntimeClient();
  let lastResponse: ConverseCommandOutput | null = null;
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    const command = new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      system: [{ text: getSystemPrompt(coachDisplayName) }] as SystemContentBlock[],
      messages,
      toolConfig: COACH_AGENT_TOOL_CONFIG,
      inferenceConfig: {
        maxTokens: 2048,
        temperature: 0.6,
        topP: 0.9,
      },
    });

    const response = (await client.send(command)) as ConverseCommandOutput;
    lastResponse = response;
    rounds += 1;

    if (response.stopReason !== "tool_use") {
      break;
    }

    const output = response.output;
    if (!output || !("message" in output)) {
      break;
    }

    const assistantMessage = (output as { message: Message }).message;
    const content = assistantMessage.content ?? [];
    const toolUseBlocks = getToolUseBlocks(content);

    if (toolUseBlocks.length === 0) {
      break;
    }

    const toolResultBlocks: ContentBlock[] = [];
    for (const toolUse of toolUseBlocks) {
      const toolUseId = toolUse.toolUseId ?? "";
      const name = toolUse.name ?? "";
      const input = toolUse.input ?? {};

      if (name === "get_coach_availability") {
        thinking.push("Called get_coach_availability");
        const summary = await getCoachAvailabilitySummary(coachId);
        thinking.push(`Tool: ${name}`);
        toolCallsList.push({ name: "get_coach_availability", input: input as unknown, result: summary });
        toolResultBlocks.push({
          toolResult: {
            toolUseId,
            content: [{ text: summary }],
          } as ToolResultBlock,
        });
      } else if (name === "find_athlete") {
        const nameContains = typeof input === "object" && input !== null && "nameContains" in input && typeof (input as { nameContains?: unknown }).nameContains === "string"
          ? (input as { nameContains: string }).nameContains
          : undefined;
        thinking.push(`Called find_athlete nameContains=${nameContains ?? "all"}`);
        let result: string;
        if (payload.role !== "coach") {
          result = "Only the coach can look up athletes.";
        } else {
          result = await getConnectedAthletesForCoach(coachId, nameContains);
        }
        thinking.push(`Tool: ${name}`);
        toolCallsList.push({ name: "find_athlete", input: { nameContains }, result });
        toolResultBlocks.push({
          toolResult: {
            toolUseId,
            content: [{ text: result }],
          } as ToolResultBlock,
        });
      } else if (name === "book_slot") {
        const startTime = typeof input === "object" && input !== null && "startTime" in input && typeof (input as { startTime?: unknown }).startTime === "string"
          ? (input as { startTime: string }).startTime.trim()
          : "";
        const athleteIdFromInput = typeof input === "object" && input !== null && "athleteId" in input && typeof (input as { athleteId?: unknown }).athleteId === "string"
          ? (input as { athleteId: string }).athleteId.trim() || undefined
          : undefined;
        const message = typeof input === "object" && input !== null && "message" in input && typeof (input as { message?: unknown }).message === "string"
          ? (input as { message: string }).message
          : undefined;
        let athleteId: string | undefined = payload.role === "coach" ? athleteIdFromInput : payload.athleteId;
        if (payload.role === "coach" && !athleteId && toolCallsList.length > 0) {
          const lastFind = [...toolCallsList].reverse().find((t) => t.name === "find_athlete");
          const parsed = lastFind && typeof lastFind.result === "string" ? parseAthleteIdFromFindResult(lastFind.result) : undefined;
          if (parsed) athleteId = parsed;
        }
        thinking.push(`Called book_slot startTime=${startTime} athleteId=${athleteId ?? "(sender)"}`);
        let result: string;
        if (!athleteId) {
          result = payload.role === "coach"
            ? "When the coach books for an athlete, use find_athlete to get their athleteId and pass it to book_slot."
            : "Booking requires the athlete to be identified (e.g. select the athlete in the test harness when sending as athlete).";
        } else if (!startTime) {
          result = "Missing startTime. Use the slot's start time in ISO format (e.g. 2025-03-04T15:00:00.000Z) from get_coach_availability.";
        } else {
          result = await createBookingForAthlete(coachId, athleteId, startTime, message);
        }
        thinking.push(`Tool: ${name}`);
        toolCallsList.push({ name: "book_slot", input: { startTime, athleteId: athleteIdFromInput, message }, result });
        toolResultBlocks.push({
          toolResult: {
            toolUseId,
            content: [{ text: result }],
          } as ToolResultBlock,
        });
      } else if (name === "add_slot") {
        const startTime = typeof input === "object" && input !== null && "startTime" in input && typeof (input as { startTime?: unknown }).startTime === "string"
          ? (input as { startTime: string }).startTime.trim()
          : "";
        const durationMinutes = typeof input === "object" && input !== null && "durationMinutes" in input && typeof (input as { durationMinutes?: unknown }).durationMinutes === "number"
          ? (input as { durationMinutes: number }).durationMinutes
          : undefined;
        thinking.push(`Called add_slot startTime=${startTime} durationMinutes=${durationMinutes ?? "default"}`);
        let result: string;
        if (payload.role !== "coach") {
          result = "Only the coach can add new availability slots.";
        } else if (!startTime) {
          result = "Missing startTime. Use the slot's start time in ISO format (e.g. 2025-03-04T15:00:00.000Z).";
        } else {
          result = await createAvailabilitySlotForCoach(coachId, startTime, durationMinutes);
        }
        thinking.push(`Tool: ${name}`);
        toolCallsList.push({ name: "add_slot", input: { startTime, durationMinutes }, result });
        toolResultBlocks.push({
          toolResult: {
            toolUseId,
            content: [{ text: result }],
          } as ToolResultBlock,
        });
      } else {
        toolResultBlocks.push({
          toolResult: {
            toolUseId,
            content: [{ text: "Unknown tool." }],
          } as ToolResultBlock,
        });
      }
    }

    messages = [
      ...messages,
      sanitizeAssistantMessage(assistantMessage),
      {
        role: "user" as const,
        content: toolResultBlocks,
      },
    ];
  }

  let finalText = "";
  if (lastResponse?.output && "message" in lastResponse.output) {
    const lastMessage = (lastResponse.output as { message: Message }).message;
    finalText = getTextFromContent(lastMessage.content);
  }

  appendToHistory(threadId, userContent, finalText.trim() || " ");

  const { replyToSender, toCoach, toAthlete } = parseStructuredReply(finalText);

  // When the model returns no text after tool use, use the last tool result so the user sees the outcome
  const lastToolResult =
    toolCallsList.length > 0 && typeof toolCallsList[toolCallsList.length - 1].result === "string"
      ? String(toolCallsList[toolCallsList.length - 1].result).trim()
      : "";

  return {
    agentReplyToSender: replyToSender || finalText.trim() || lastToolResult || "I didn't get that.",
    toCoach: toCoach ?? null,
    toAthlete: toAthlete ?? null,
    thinking,
    toolCalls: toolCallsList.length > 0 ? toolCallsList : undefined,
  };
}
