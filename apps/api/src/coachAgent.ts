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

export type AgentChatRole = "athlete" | "coach";

export interface AgentChatPayload {
  role: AgentChatRole;
  message: string;
  coachId: string;
  threadId?: string;
  /** When role is "athlete", the athlete's user id (for booking and future SMS). Required for book_slot. */
  athleteId?: string;
}

export interface AgentChatResult {
  agentReplyToSender: string;
  toCoach: string | null;
  toAthlete: string | null;
  thinking: string[];
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
}

const SYSTEM_PROMPT = `You are a helpful assistant for a sports coach. You relay and coordinate between the coach and their athletes (or parents).

- You receive messages either from the ATHLETE (or parent) or from the COACH. The current message will be prefixed with [Athlete]: or [Coach]:.
- When the coach mentions an athlete by name (e.g. "book Maceo for Monday 2pm"), use find_athlete first to resolve the name to an athlete. Use the athleteId from that result when calling book_slot for the coach. Never tell the user internal athleteIds.
- When asked about the coach's schedule, use get_coach_availability. When you tell the user about slots, use only the date and time (e.g. "Tuesday, Mar 4 at 3:00 PM"); never mention the part after the pipe (|) or any internal IDs. When the athlete wants to book, call book_slot with the exact startTime that appears after the pipe for that slot; do not repeat that value to the user.
- Respond naturally to the sender. If you need to relay something to the other party (e.g. "tell the coach that the athlete asked about rescheduling"), include a single line at the end of your response in one of these formats:
  RELAY_TO_COACH: <message>
  RELAY_TO_ATHLETE: <message>
  Omit these lines if there is nothing to relay.
- Keep replies concise and helpful. For availability, list dates/times clearly.`;

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
          "Find athletes connected to this coach by name. Use when the coach refers to an athlete by name (e.g. 'book Maceo for Monday 2pm'). Only the coach can use this. Returns displayName and athleteId; use athleteId in book_slot when the coach is booking for that athlete.",
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
          "Book an availability slot for an athlete by date and time. Use the exact start time from get_coach_availability in ISO format (e.g. 2025-03-04T15:00:00.000Z). When the athlete is messaging, they are booking for themselves (do not pass athleteId). When the coach is messaging and booking for an athlete, pass athleteId from find_athlete.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              startTime: { type: "string", description: "Slot start time in ISO 8601 format (e.g. 2025-03-04T15:00:00.000Z)" },
              athleteId: { type: "string", description: "Required when coach is booking for someone; use athleteId from find_athlete. Omit when the athlete is booking for themselves." },
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
          "Create a new availability slot for the coach by date and time. Use this when the coach asks to open up a specific time that does not already exist, e.g. 'add a slot next Monday at 2pm'. Only use this when the message is from [Coach].",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              startTime: {
                type: "string",
                description: "Slot start time in ISO 8601 format (e.g. 2025-03-04T15:00:00.000Z)",
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

  for (const r of rules) {
    const slots = r.slots ?? [];
    for (const s of slots) {
      const start = s.startTime;
      const end = s.endTime;
      const startFmt = start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      const endFmt = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      parts.push(`${startFmt} - ${endFmt} (${s.status}, recurring ${r.recurrence}) | ${start.toISOString()}`);
    }
  }

  for (const s of oneOffSlots) {
    const start = s.startTime;
    const end = s.endTime;
    const startFmt = start.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    const endFmt = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    parts.push(`${startFmt} - ${endFmt} (${s.status}, one-off) | ${start.toISOString()}`);
  }

  if (parts.length === 0) return "No upcoming availability on the schedule.";
  return parts.join("\n");
}

/**
 * List athletes connected to this coach (for the agent to resolve names like "Maceo").
 * Returns displayName and athleteId (userId) so the model can pass athleteId to book_slot.
 */
export async function getConnectedAthletesForCoach(
  coachId: string,
  nameContains?: string
): Promise<string> {
  const list = await prisma.coachAthlete.findMany({
    where: {
      coachProfileId: coachId,
      status: "active",
      ...(nameContains?.trim()
        ? { athlete: { displayName: { contains: nameContains.trim(), mode: "insensitive" as const } } }
        : {}),
    },
    include: { athlete: { select: { displayName: true, userId: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (list.length === 0) {
    return nameContains?.trim()
      ? `No connected athlete found matching "${nameContains}". List all with find_athlete (no name filter).`
      : "No connected athletes yet. Athletes appear here after they sign up via your invite link.";
  }

  const lines = list.map(
    (ca) => `${ca.athlete.displayName} (use athleteId: ${ca.athlete.userId} for book_slot)`
  );
  return lines.join("\n");
}

/**
 * Create a booking for an athlete (agent-initiated) by slot start time. Validates athlete is linked to coach via CoachAthlete.
 * Does not create Stripe payment; booking is pending until coach confirms.
 */
export async function createBookingForAthlete(
  coachId: string,
  athleteId: string,
  startTimeIso: string,
  message?: string
): Promise<string> {
  const link = await prisma.coachAthlete.findFirst({
    where: { coachProfileId: coachId, athlete: { userId: athleteId }, status: "active" },
  });
  if (!link) {
    return "This athlete is not linked to this coach. Only connected athletes can book.";
  }

  const requestedStart = new Date(startTimeIso);
  if (Number.isNaN(requestedStart.getTime())) {
    return "Invalid start time. Use ISO 8601 format (e.g. 2025-03-04T15:00:00.000Z).";
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
    include: { coach: true },
  });
  if (!slot) return "No slot found for that date and time. Check availability and use the exact start time.";
  if (slot.status !== "available") return `That slot is not available (status: ${slot.status}).`;

  const slotId = slot.id;
  const existing = await prisma.booking.findFirst({
    where: { slotId, athleteId, status: { not: "cancelled" } },
  });
  if (existing) return "This athlete already has a pending or confirmed request for this slot.";

  const confirmed = await prisma.booking.findFirst({
    where: { slotId, status: "confirmed" },
  });
  if (confirmed) return "This slot is already booked by someone else.";

  const booking = await prisma.booking.create({
    data: {
      athleteId,
      coachId,
      slotId,
      message: message?.trim() || null,
    },
    include: { slot: true, athlete: { select: { name: true, email: true } } },
  });

  const start = booking.slot.startTime.toISOString().slice(0, 16);
  const end = booking.slot.endTime.toISOString().slice(11, 16);
  return `Booking requested for ${start} - ${end}. The coach will confirm. Booking ID: ${booking.id}.`;
}

/**
 * Create a new one-off availability slot for a coach.
 */
export async function createAvailabilitySlotForCoach(
  coachId: string,
  startTimeIso: string,
  durationMinutes?: number
): Promise<string> {
  const start = new Date(startTimeIso);
  if (Number.isNaN(start.getTime())) {
    return "Invalid start time. Use ISO 8601 format (e.g. 2025-03-04T15:00:00.000Z).";
  }

  const duration = Number.isFinite(durationMinutes as number) && (durationMinutes as number) > 0 ? (durationMinutes as number) : 60;
  const end = new Date(start.getTime() + duration * 60 * 1000);

  const overlapping = await prisma.availabilitySlot.findFirst({
    where: {
      coachId,
      startTime: { lt: end },
      endTime: { gt: start },
    },
  });
  if (overlapping) {
    return "You already have an availability slot that overlaps this time. I left the existing one as-is.";
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

  const startLabel = start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
    content: [{ text: m.content }] as ContentBlock[],
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

/**
 * Invoke the coach assistant agent using Bedrock Converse API with tool use.
 */
export async function invokeCoachAgent(
  payload: AgentChatPayload,
  existingMessages?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AgentChatResult> {
  const { role, message, coachId, threadId = "default" } = payload;

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
      system: [{ text: SYSTEM_PROMPT }] as SystemContentBlock[],
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
        const athleteId = payload.role === "coach" ? athleteIdFromInput : payload.athleteId;
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
      assistantMessage,
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

  appendToHistory(threadId, userContent, finalText);

  const { replyToSender, toCoach, toAthlete } = parseStructuredReply(finalText);

  return {
    agentReplyToSender: replyToSender || finalText.trim() || "I didn't get that.",
    toCoach: toCoach ?? null,
    toAthlete: toAthlete ?? null,
    thinking,
    toolCalls: toolCallsList.length > 0 ? toolCallsList : undefined,
  };
}
