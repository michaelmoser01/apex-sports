import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ContentBlock,
  type SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

const BEDROCK_REGION = process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-haiku-20240307-v1:0";

let client: BedrockRuntimeClient | null = null;

function getClient(): BedrockRuntimeClient {
  if (!client) {
    client = new BedrockRuntimeClient({ region: BEDROCK_REGION });
  }
  return client;
}

export function isBedrockConfigured(): boolean {
  return !!BEDROCK_MODEL_ID;
}

const SYSTEM_PROMPT_TEMPLATE = (coachContext: { displayName: string; sports?: string[]; serviceCities?: string[] }) => `You are helping a coach write their "About my coaching style and background" section for their profile on a sports coaching platform. Your job is to turn what they share into a **compelling, story-driven profile** that makes athletes and parents want to work with them.

**Coach details (use these; do not invent):**
- Name: ${coachContext.displayName.trim() || "The coach"}. Always refer to them by this exact name in the bio. Never use another name (e.g. do not use "Sarah" or any name unless it is exactly "${coachContext.displayName.trim() || "The coach"}").
${coachContext.sports?.length ? `- Sports they coach: ${coachContext.sports.join(", ")}.` : ""}
${coachContext.serviceCities?.length ? `- Service areas: ${coachContext.serviceCities.join(", ")}.` : ""}

**Rules:**
- You receive the FULL conversation history. Use it. Do not ask the same or similar question twice. If the coach already answered something (e.g. who they work with, their approach, what makes them unique), incorporate that into the bio and either ask something different or invite them to accept or add more.
- Only use information the coach has actually said. Do not invent credentials, years, or facts.
- Write in a warm, professional tone in third person using the coach's real name above.
- If you need more, ask one short follow-up about something they have NOT yet covered (e.g. certifications, session structure, success stories)—or if they have given plenty, update the bioPreview and say "Here's your profile so far—accept it or tell me what to add."
- When you have enough to write a profile, produce a **structured markdown** "About your coaching" section (see below).

**Be creative and compelling:** Don't just repeat their words—elevate them. Use vivid, active language. Turn their experience into a short story: why they coach, how they make a difference, and what athletes get. Use **bold** for key phrases that grab attention. Frame their approach so it sounds distinctive and memorable while staying 100% true to what they said. Help them sound like the standout coach they are.

**Bio format:** Build a complete, compelling profile section using markdown:
- Use **headings** (##) for sections, e.g. ## Experience, ## My approach, ## Who I work with, ## What you'll get.
- Use **bullet points** and short paragraphs. Expand and reframe their ideas into clear, confident, story-like copy—the kind that belongs on a top coach's profile.
- Aim for 3–5 sections with a few bullets or 1–2 sentences each. Use bold for emphasis. Only include facts the coach has shared; make every line count.

You must respond with ONLY a valid JSON object—no markdown, no code fence, no text before or after. Use exactly this shape:
{"message": "Your reply to the coach (question or closing invitation)", "bioPreview": "The full markdown profile section, or empty string if you are only asking a question and don't have enough yet"}

Output only the JSON. The message will be shown in the chat; the bioPreview will be shown in a separate preview panel.

If the coach is answering a follow-up and we already have a current bio draft, incorporate their new answer into the existing structure and return the updated markdown in bioPreview.`;

const SYSTEM_PROMPT_GENERATE = (coachContext: { displayName: string; sports?: string[]; serviceCities?: string[] }) => `You are writing a standout "About my coaching style and background" section for a coach's profile. Use ONLY the coach details below—do not invent credentials, years, or facts.

**Coach details:**
- Name: ${coachContext.displayName.trim() || "The coach"}. Always use this exact name.
${coachContext.sports?.length ? `- Sports they coach: ${coachContext.sports.join(", ")}.` : ""}
${coachContext.serviceCities?.length ? `- Service areas: ${coachContext.serviceCities.join(", ")}.` : ""}

**Task:** Write a complete, compelling profile in markdown that makes athletes want to work with this coach. Use vivid, confident language—the kind that belongs on a top coach's profile. Use headings (##) for sections like ## Experience, ## My approach, ## Who I work with, ## What you'll get. Use bullet points and **bold** for key phrases. Write in third person, warm and professional. Since you only have basic details, write strong copy that invites athletes to reach out—do not invent specific stats or credentials. Aim for 3–5 sections; every line should sound distinctive and memorable.

You MUST respond with ONLY a valid JSON object. Use exactly this shape (escape newlines in the string as \\n):
{"message": "Done.", "bioPreview": "The full markdown profile section here"}

Output only the JSON. The bioPreview field must not be empty.`;

const SYSTEM_PROMPT_ENHANCE = (coachContext: { displayName: string; sports?: string[]; serviceCities?: string[] }) => `You are rewriting a coach's bio into a standout "About my coaching style and background" section. The user will provide their current bio. Your job is to transform it into something noticeably more compelling while staying 100% faithful to the facts they stated.

**Coach details (use this name only):**
- Name: ${coachContext.displayName.trim() || "The coach"}.
${coachContext.sports?.length ? `- Sports: ${coachContext.sports.join(", ")}.` : ""}
${coachContext.serviceCities?.length ? `- Service areas: ${coachContext.serviceCities.join(", ")}.` : ""}

**Rules:**
- Do not add or invent any facts. Use only what they wrote.
- Restructure into clear markdown: headings (##), bullet points, and **bold** for emphasis. Aim for 3–5 sections (e.g. ## Experience, ## My approach, ## Who I work with, ## What you'll get).
- Elevate the language: stronger verbs, more vivid phrasing, confident tone. Make it read like a standout coach profile, not a rough draft. Transform their words into polished, story-like copy that would impress athletes and parents.
- Length can be similar or slightly longer if it adds impact. Every line should earn its place.

You MUST respond with ONLY a valid JSON object. Use exactly this shape (escape newlines in bioPreview as \\n):
{"message": "Done.", "bioPreview": "The improved full markdown profile section here"}

Output only the JSON. The bioPreview field must not be empty.`;

export type BioDraftMode = "generate" | "enhance";

export interface BioDraftInput {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  currentBioPreview?: string;
  coachContext: { displayName: string; sports?: string[]; serviceCities?: string[] };
  /** When set, messages are built from mode; messages array is optional. */
  mode?: BioDraftMode;
  /** For mode "enhance", the current bio text to improve. */
  sourceText?: string;
}

export interface BioDraftOutput {
  message: string;
  bioPreview: string;
}

/**
 * Build the system prompt. For generate/enhance modes use dedicated prompts; otherwise use chat template.
 */
function buildSystemPrompt(
  coachContext: BioDraftInput["coachContext"],
  options: { currentBioPreview?: string; mode?: BioDraftMode } = {}
): string {
  const { currentBioPreview, mode } = options;
  if (mode === "generate") return SYSTEM_PROMPT_GENERATE(coachContext);
  if (mode === "enhance") return SYSTEM_PROMPT_ENHANCE(coachContext);
  const base = SYSTEM_PROMPT_TEMPLATE(coachContext);
  if (currentBioPreview && currentBioPreview.trim()) {
    return `${base}

Current bio draft (refine it with any new information from the coach's latest message):
---
${currentBioPreview.trim()}
---`;
  }
  return base;
}

/**
 * Convert our message format to Bedrock Converse API format.
 */
function toBedrockMessages(messages: BioDraftInput["messages"]): Message[] {
  return messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: [{ text: m.content }] as ContentBlock[],
  }));
}

/**
 * Parse the model's response. Expects a JSON object with message and bioPreview.
 * Handles malformed JSON (e.g. unescaped newlines in strings) and extracts markdown when possible.
 */
function parseResponse(text: string): BioDraftOutput {
  const trimmed = text.trim();
  if (!trimmed) {
    return { message: "Could you tell me a bit about your coaching experience?", bioPreview: "" };
  }
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  const jsonStr = jsonMatch ? jsonMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const message = typeof obj.message === "string" ? obj.message : (typeof obj.Message === "string" ? obj.Message : "");
      const bioPreview = typeof obj.bioPreview === "string" ? obj.bioPreview : (typeof obj.bio_preview === "string" ? obj.bio_preview : "");
      if (message || bioPreview) {
        return {
          message: message || "Done.",
          bioPreview: (bioPreview || "").trim(),
        };
      }
    }
  } catch {
    // JSON.parse failed (e.g. unescaped newlines in string); fall through to extraction
  }
  // Extract from raw text (handles unescaped newlines in bioPreview)
  let extractedMessage = "";
  let extractedBio = "";
  const bioKey = '"bioPreview"';
  const bioKeyIndex = trimmed.indexOf(bioKey);
  if (bioKeyIndex >= 0) {
    const afterKey = trimmed.slice(bioKeyIndex + bioKey.length);
    const colonIndex = afterKey.indexOf(":");
    if (colonIndex >= 0) {
      let value = afterKey.slice(colonIndex + 1).trim();
      if (value.startsWith('"')) {
        value = value.slice(1);
        const endQuote = value.indexOf('"');
        if (endQuote >= 0) {
          value = value.slice(0, endQuote).replace(/\\n/g, "\n").replace(/\\"/g, '"');
        } else {
          value = value.replace(/\\n/g, "\n").replace(/\\"/g, '"');
        }
      } else {
        const nextKey = value.search(/\s*"\w+"\s*:/);
        const end = nextKey >= 0 ? nextKey : value.length;
        value = value.slice(0, end).trim();
        const lastBrace = value.lastIndexOf("}");
        if (lastBrace > 0) value = value.slice(0, lastBrace).trim();
      }
      if (value && value.length > 20) extractedBio = value.trim();
    }
  }
  const messageMatch = trimmed.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (messageMatch) {
    extractedMessage = messageMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }
  if (!extractedBio && (trimmed.includes("## ") || (trimmed.includes("**") && trimmed.length > 80))) {
    extractedBio = trimmed;
  }
  if (extractedBio) {
    return { message: extractedMessage || "Done.", bioPreview: extractedBio };
  }
  if (extractedMessage) {
    return { message: extractedMessage, bioPreview: "" };
  }
  return { message: "Done.", bioPreview: trimmed };
}

/**
 * Bedrock Converse API requires the conversation to start with a user message.
 * Drop any leading assistant messages so we only send from the first user turn onward.
 */
function ensureStartsWithUserMessage(
  messages: BioDraftInput["messages"]
): BioDraftInput["messages"] {
  const firstUserIndex = messages.findIndex((m) => m.role === "user");
  if (firstUserIndex <= 0) return messages;
  return messages.slice(firstUserIndex);
}

export async function invokeBioDraft(input: BioDraftInput): Promise<BioDraftOutput> {
  let messages: BioDraftInput["messages"];
  if (input.mode === "generate") {
    messages = [{ role: "user", content: "Write a compelling coaching profile for me based on the details you know." }];
  } else if (input.mode === "enhance" && input.sourceText != null) {
    messages = [{ role: "user", content: input.sourceText.trim() || "Improve this bio." }];
  } else if (Array.isArray(input.messages) && input.messages.length > 0) {
    messages = ensureStartsWithUserMessage(input.messages);
    if (messages.length === 0) {
      throw new Error("A conversation must start with a user message. Try again with a conversation that starts with a user message.");
    }
  } else {
    throw new Error("Either provide messages or use mode 'generate' or 'enhance' with sourceText for enhance.");
  }

  const bedrock = getClient();
  const systemPrompt = buildSystemPrompt(input.coachContext, {
    currentBioPreview: input.mode === "enhance" ? input.sourceText : input.currentBioPreview,
    mode: input.mode,
  });
  const bedrockMessages = toBedrockMessages(messages);

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: systemPrompt }] as SystemContentBlock[],
    messages: bedrockMessages,
    inferenceConfig: {
      maxTokens: 2048,
      temperature: 0.6,
      topP: 0.9,
    },
  });

  const response = await bedrock.send(command);
  const output = response.output;
  if (!output || !("message" in output)) {
    throw new Error("Bedrock returned no message");
  }
  const msg = (output as { message: { content: Array<{ text?: string }> } }).message;
  const firstBlock = msg?.content?.[0];
  const text = firstBlock && "text" in firstBlock ? (firstBlock as { text: string }).text : "";
  return parseResponse(text ?? "");
}
