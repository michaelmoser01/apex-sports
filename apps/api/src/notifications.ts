/**
 * Booking notifications via SendGrid (email) and AWS SNS (SMS).
 * Failures are logged and do not affect the HTTP response.
 */

import sgMail from "@sendgrid/mail";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const sns = new SNSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
const fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? "notifications@apexsports.example.com";
const sendSms = process.env.SEND_SMS !== "false";
const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
const myBookingsUrl = appUrl ? `${appUrl}/bookings` : "";
const dashboardAthletesUrl = appUrl ? `${appUrl}/dashboard/athletes` : "";
/** IANA timezone for email times (slot times are stored UTC). Default US/Pacific. */
const notificationTimeZone = process.env.NOTIFICATION_TIMEZONE ?? "America/Los_Angeles";

/** Shared email sender — lazily initialises the SendGrid API key on first use. */
async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
  await sgMail.send({
    to: params.to,
    from: fromEmail,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

function formatSlotTime(iso: string, timeZone: string = notificationTimeZone): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      timeZone,
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Escape for safe use in HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Visual helpers
// ---------------------------------------------------------------------------

const BRAND = "#ec741a";
const BRAND_DARK = "#dd5a10";
const SLATE_900 = "#0f172a";
const SLATE_700 = "#334155";
const SLATE_500 = "#64748b";
const SLATE_200 = "#e2e8f0";
const SLATE_100 = "#f1f5f9";
const SLATE_50 = "#f8fafc";

/** Renders a row inside an info card: emoji + label + value. */
function iconRow(icon: string, label: string, value: string): string {
  return `<tr>
  <td style="padding: 8px 12px; vertical-align: top; width: 28px; font-size: 16px; line-height: 1;">${icon}</td>
  <td style="padding: 8px 4px 8px 0; vertical-align: top; color: ${SLATE_500}; font-size: 14px; font-weight: 600; white-space: nowrap;">${escapeHtml(label)}</td>
  <td style="padding: 8px 12px 8px 8px; vertical-align: top; color: ${SLATE_700}; font-size: 14px;">${value}</td>
</tr>`;
}

/** Renders a rounded info card with structured label/value rows. */
function infoCard(rows: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background: ${SLATE_50}; border: 1px solid ${SLATE_200}; border-radius: 12px; overflow: hidden;">
${rows.join("\n")}
</table>`;
}

const BADGE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  confirmed: { bg: "#dcfce7", color: "#166534", label: "Confirmed" },
  cancelled: { bg: "#fee2e2", color: "#991b1b", label: "Cancelled" },
  completed: { bg: "#fff7ed", color: "#9a3412", label: "Completed" },
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  private:   { bg: "#ede9fe", color: "#5b21b6", label: "Private 1-on-1" },
};

function statusBadge(status: string): string {
  const s = BADGE_STYLES[status] ?? BADGE_STYLES.pending;
  return `<span style="display: inline-block; padding: 4px 12px; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; border-radius: 20px; background: ${s.bg}; color: ${s.color};">${s.label}</span>`;
}

/** Brand-orange quote block for messages. */
function quoteBlock(text: string): string {
  return `<div style="margin: 16px 0; padding: 16px 20px; background: ${SLATE_50}; border-radius: 10px; border-left: 4px solid ${BRAND}; font-size: 15px; line-height: 1.6; color: ${SLATE_700};">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
}

/**
 * Shared HTML email wrapper matching the ApexSports website brand.
 * White header with text logo, orange accent, dark footer.
 */
function htmlEmail(contentHtml: string, ctaLabel?: string, ctaUrl?: string): string {
  const href = (ctaUrl ?? myBookingsUrl) || "";
  const ctaBlock =
    href && ctaLabel
      ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0 0;">
      <tr><td align="center">
        <a href="${escapeHtml(href)}" style="display: inline-block; padding: 14px 32px; background: ${BRAND}; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; border-radius: 12px; letter-spacing: -0.01em; mso-padding-alt: 0; text-align: center;">${escapeHtml(ctaLabel)}</a>
      </td></tr>
    </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apex Sports</title>
  <style>@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');</style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${SLATE_700}; background: ${SLATE_50}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${SLATE_50}; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px;">

          <!-- Header -->
          <tr>
            <td style="padding: 24px 32px; text-align: left;">
              <span style="font-size: 22px; font-weight: 800; letter-spacing: -0.03em; text-decoration: none;">
                <span style="color: ${SLATE_900};">Apex</span><span style="color: ${BRAND};">Sports</span>
              </span>
            </td>
          </tr>

          <!-- Orange accent line -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="height: 3px; background: linear-gradient(90deg, ${BRAND} 0%, ${BRAND_DARK} 100%); border-radius: 2px;"></div>
            </td>
          </tr>

          <!-- Content card -->
          <tr>
            <td style="padding: 8px 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04); overflow: hidden;">
                <tr>
                  <td style="padding: 32px 32px 36px;">
${contentHtml}${ctaBlock}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 13px; color: ${SLATE_500};">
                You're receiving this because you have an <span style="color: ${SLATE_900}; font-weight: 600;">Apex</span><span style="color: ${BRAND}; font-weight: 600;">Sports</span> account.
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                &copy; ${new Date().getFullYear()} ApexSports. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email functions
// ---------------------------------------------------------------------------

export interface AthleteMessageToCoachParams {
  coachEmail: string;
  athleteEmail: string | null;
  athleteDisplayName: string;
  message: string;
}

export async function sendAthleteMessageToCoach(params: AthleteMessageToCoachParams): Promise<void> {
  const { coachEmail, athleteEmail, athleteDisplayName, message } = params;
  const name = athleteDisplayName?.trim() || "An athlete";
  const body = message?.trim() || "(No message)";
  const replyHint = athleteEmail
    ? `You can reply directly to this email to respond to ${name}.`
    : "Log in to Apex Sports to view your athletes and respond.";

  const subject = `New message from ${name}`;
  const bodyText = [
    `${name} sent you a message from your Apex Sports profile:`,
    "",
    "---",
    body,
    "---",
    "",
    replyHint,
    myBookingsUrl ? `Dashboard: ${myBookingsUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 4px; font-size: 14px; color: ${SLATE_500};">New message</p>`,
      `<p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">${escapeHtml(name)} sent you a message</p>`,
      quoteBlock(body),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_500};">${escapeHtml(replyHint)}</p>`,
    ].join("\n"),
    "Go to dashboard",
    myBookingsUrl || undefined
  );

  try {
    await sendEmail({
      to: coachEmail,
      subject,
      text: bodyText,
      html: bodyHtml,
      replyTo: athleteEmail ?? undefined,
    });
  } catch (err) {
    console.error("[notifications] sendAthleteMessageToCoach email failed:", err, "to:", coachEmail);
    throw err;
  }
}

export interface NewAthleteConnectedToCoachParams {
  coachEmail: string;
  athleteDisplayName: string;
}

export async function sendNewAthleteConnectedToCoach(params: NewAthleteConnectedToCoachParams): Promise<void> {
  const { coachEmail, athleteDisplayName } = params;
  const name = athleteDisplayName?.trim() || "An athlete";

  const subject = `${name} just connected with you`;
  const bodyText = [
    "Hi,",
    "",
    `${name} signed up using your invite link and is now connected to you on Apex Sports.`,
    "",
    "They can view your profile and request sessions. You'll see them in your Athletes list.",
    dashboardAthletesUrl ? `View your athletes: ${dashboardAthletesUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 4px; font-size: 14px; color: ${SLATE_500};">New connection</p>`,
      `<p style="margin: 0 0 20px; font-size: 18px; font-weight: 700; color: ${SLATE_900};"><strong>${escapeHtml(name)}</strong> is now connected with you</p>`,
      `<p style="margin: 0 0 8px; font-size: 15px; color: ${SLATE_700};">They signed up using your invite link and can now view your profile and request sessions.</p>`,
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_500};">You'll find them in your Athletes list on the dashboard.</p>`,
    ].join("\n"),
    "View your athletes",
    dashboardAthletesUrl || undefined
  );

  try {
    await sendEmail({ to: coachEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendNewAthleteConnectedToCoach email failed:", err);
  }
}

export interface BookingRequestedToCoachParams {
  coachEmail: string;
  coachPhone?: string | null;
  athleteName: string | null;
  slotStart: string;
  slotEnd: string;
  message?: string | null;
  bookingId: string;
  lockedPrivate?: boolean;
}

export async function sendBookingRequestedToCoach(params: BookingRequestedToCoachParams): Promise<void> {
  const { coachEmail, coachPhone, athleteName, slotStart, slotEnd, message, bookingId, lockedPrivate } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const athlete = athleteName?.trim() || "An athlete";
  const ctaUrl = bookingId && appUrl ? `${appUrl}/bookings/${bookingId}` : myBookingsUrl;
  const typeLabel = lockedPrivate ? "private session" : "booking";

  const subject = lockedPrivate
    ? `Private session request from ${athlete}`
    : `New booking request from ${athlete}`;
  const bodyText = [
    `${athlete} requested a ${typeLabel} with you.`,
    "",
    `Time: ${slotStr}`,
    lockedPrivate ? "Type: Private (1-on-1) — this slot will be locked to this athlete only." : null,
    message?.trim() ? `Message: ${message.trim()}` : null,
    "",
    "Log in to Apex Sports to accept or decline.",
    ctaUrl ? `View booking: ${ctaUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const rows = [
    iconRow("📅", "When", escapeHtml(slotStr)),
    iconRow("👤", "Athlete", `<strong>${escapeHtml(athlete)}</strong>`),
  ];
  if (lockedPrivate) rows.push(iconRow("🔒", "Type", statusBadge("private")));

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 4px; font-size: 14px; color: ${SLATE_500};">New ${typeLabel} request</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">${escapeHtml(athlete)} wants to train with you</p>`,
      infoCard(rows),
      message?.trim() ? quoteBlock(message.trim()) : "",
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_500};">Review and respond from your dashboard.</p>`,
    ].join("\n"),
    "View booking",
    ctaUrl
  );

  try {
    await sendEmail({ to: coachEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendBookingRequestedToCoach email failed:", err);
  }

  if (sendSms && coachPhone?.trim()) {
    try {
      const phone = normalizePhone(coachPhone.trim());
      const smsBody = lockedPrivate
        ? `ApexSports: ${athlete} requested a private session for ${formatSlotTime(slotStart)}. Log in to accept or decline.`
        : `ApexSports: ${athlete} requested a booking for ${formatSlotTime(slotStart)}. Log in to accept or decline.`;
      await sns.send(
        new PublishCommand({
          PhoneNumber: phone,
          Message: smsBody,
          MessageAttributes: {
            "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
          },
        })
      );
    } catch (err) {
      console.error("[notifications] sendBookingRequestedToCoach SMS failed:", err);
    }
  }
}

export interface CoachBookedAthleteParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  slotStart: string;
  slotEnd: string;
}

/** Notify athlete when the coach has created a booking for them (e.g. via the assistant). Used when no payment is required. */
export async function sendCoachBookedAthlete(params: CoachBookedAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, slotStart, slotEnd } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "Your coach";
  const greeting = athleteName?.trim() ? `Hi ${athleteName.trim()},` : "Hi,";

  const subject = `${coach} booked you for a session`;
  const bodyText = [
    greeting,
    "",
    `${coach} has booked you for a session.`,
    "",
    `Time: ${slotStr}`,
    "",
    "It's pending until they confirm. You can view it in My Bookings.",
    myBookingsUrl ? `My Bookings: ${myBookingsUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">${escapeHtml(coach)} booked you for a session</p>`,
      `<p style="margin: 0 0 4px;">${statusBadge("pending")}</p>`,
      infoCard([
        iconRow("📅", "When", escapeHtml(slotStr)),
        iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
      ]),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_500};">It's pending until they confirm. You can track it from My Bookings.</p>`,
    ].join("\n"),
    "My Bookings"
  );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendCoachBookedAthlete failed:", err);
  }
}

export interface CoachInviteToBookSlotParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  slotStart: string;
  slotEnd: string;
  /** Deep link to coach profile with slot pre-selected: e.g. /coaches/:coachId?slotId=:slotId */
  bookingUrl: string;
}

/** Notify athlete when the coach has reserved a time for them; they must complete booking (and payment) via the link. */
export async function sendCoachInviteToBookSlot(params: CoachInviteToBookSlotParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, slotStart, slotEnd, bookingUrl } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "Your coach";
  const greeting = athleteName?.trim() ? `Hi ${athleteName.trim()},` : "Hi,";

  const subject = `${coach} reserved a time for you — complete your booking`;
  const bodyText = [
    greeting,
    "",
    `${coach} has reserved a time for you.`,
    "",
    `Time: ${slotStr}`,
    "",
    "Complete your booking (including payment) using the link below. The slot is held for you until you finish.",
    bookingUrl || myBookingsUrl ? (bookingUrl || myBookingsUrl) : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">A time has been reserved for you</p>`,
      infoCard([
        iconRow("📅", "When", escapeHtml(slotStr)),
        iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
      ]),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">Complete your booking (including payment) using the button below. The slot is held for you until you finish.</p>`,
    ].join("\n"),
    "Complete booking",
    bookingUrl || myBookingsUrl
  );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendCoachInviteToBookSlot failed:", err);
  }
}

export interface BookingRequestSubmittedToAthleteParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  slotStart: string;
  slotEnd: string;
  bookingId?: string;
}

export async function sendBookingRequestSubmittedToAthlete(params: BookingRequestSubmittedToAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, slotStart, slotEnd, bookingId } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "your coach";
  const ctaUrl = bookingId && appUrl ? `${appUrl}/bookings/${bookingId}` : myBookingsUrl;
  const greeting = athleteName?.trim() ? `Hi ${athleteName.trim()},` : "Hi,";

  const subject = "Booking request sent — we'll let you know when they respond";
  const bodyText = [
    greeting,
    "",
    `Your booking request has been sent to ${coach}.`,
    "",
    `Requested time: ${slotStr}`,
    "",
    "We'll email you as soon as they accept or decline.",
    ctaUrl ? `View booking: ${ctaUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Your request is on its way</p>`,
      `<p style="margin: 0 0 4px;">${statusBadge("pending")}</p>`,
      infoCard([
        iconRow("📅", "When", escapeHtml(slotStr)),
        iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
      ]),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_500};">We'll email you as soon as they accept or decline.</p>`,
    ].join("\n"),
    "View booking",
    ctaUrl
  );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendBookingRequestSubmittedToAthlete failed:", err);
  }
}

export interface GroupInviteToAthleteParams {
  athleteEmail: string;
  inviterName?: string | null;
  coachDisplayName: string;
  sport?: string | null;
  slotStart: string;
  slotEnd: string;
  perPersonRate?: number | null;
  groupSize: number;
  spotsRemaining: number;
  inviteUrl: string;
}

export async function sendGroupInviteToAthlete(params: GroupInviteToAthleteParams): Promise<void> {
  const {
    athleteEmail, inviterName, coachDisplayName, sport,
    slotStart, slotEnd, perPersonRate, groupSize, spotsRemaining, inviteUrl,
  } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "a coach";
  const inviter = inviterName?.trim() || "Someone";
  const sportStr = sport ? ` ${sport}` : "";

  const subject = `${inviter} invited you to a group${sportStr} session`;
  const bodyText = [
    "Hi,",
    "",
    `${inviter} invited you to a group training session with ${coach}.`,
    "",
    `When: ${slotStr}`,
    sport ? `Sport: ${sport}` : null,
    `Group size: ${groupSize} people (${spotsRemaining} spot${spotsRemaining !== 1 ? "s" : ""} left)`,
    perPersonRate != null ? `Per-person rate: $${perPersonRate}/hr` : null,
    "",
    `Join the session: ${inviteUrl}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const rows = [
    iconRow("📅", "When", escapeHtml(slotStr)),
    iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
  ];
  if (sport) rows.push(iconRow("⚽", "Sport", escapeHtml(sport)));
  rows.push(iconRow("👥", "Group", `${groupSize} people &middot; <strong>${spotsRemaining} spot${spotsRemaining !== 1 ? "s" : ""} left</strong>`));
  if (perPersonRate != null) rows.push(iconRow("💲", "Rate", `<strong>$${perPersonRate}/hr</strong> per person`));

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 4px; font-size: 14px; color: ${SLATE_500};">Group session invite</p>`,
      `<p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">${escapeHtml(inviter)} invited you to train</p>`,
      infoCard(rows),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">Tap below to view the session details and join the group.</p>`,
    ].join("\n"),
    "Join this session",
    inviteUrl
  );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendGroupInviteToAthlete failed:", err);
  }
}

export type BookingStatusForAthlete = "confirmed" | "cancelled" | "completed";

export interface BookingStatusToAthleteParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  newStatus: BookingStatusForAthlete;
  slotStart: string;
  slotEnd: string;
  bookingId?: string;
}

export async function sendBookingStatusToAthlete(params: BookingStatusToAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, newStatus, slotStart, slotEnd, bookingId } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "Your coach";
  const ctaUrl = bookingId && appUrl ? `${appUrl}/bookings/${bookingId}` : myBookingsUrl;
  const greeting = athleteName?.trim() ? `Hi ${athleteName.trim()},` : "Hi,";

  const card = infoCard([
    iconRow("📅", "When", escapeHtml(slotStr)),
    iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
  ]);

  const statusMessages: Record<
    BookingStatusForAthlete,
    { subject: string; body: string; bodyHtml: string }
  > = {
    confirmed: {
      subject: `Booking confirmed with ${coach}`,
      body: [
        greeting,
        "",
        `Great news! ${coach} accepted your booking.`,
        "",
        `Time: ${slotStr}`,
        "",
        "You're all set — see you there!",
        ctaUrl ? `View booking: ${ctaUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      bodyHtml: htmlEmail(
        [
          `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
          `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">You're all set!</p>`,
          `<p style="margin: 0 0 4px;">${statusBadge("confirmed")}</p>`,
          card,
          `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">${escapeHtml(coach)} accepted your booking. See you there!</p>`,
        ].join("\n"),
        "View booking",
        ctaUrl
      ),
    },
    cancelled: {
      subject: `Booking cancelled — ${coach}`,
      body: [
        greeting,
        "",
        `Unfortunately, ${coach} declined or cancelled your booking.`,
        "",
        `Time: ${slotStr}`,
        "",
        "You can browse availability and book another time.",
        ctaUrl ? `My Bookings: ${ctaUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      bodyHtml: htmlEmail(
        [
          `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
          `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Booking update</p>`,
          `<p style="margin: 0 0 4px;">${statusBadge("cancelled")}</p>`,
          card,
          `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">${escapeHtml(coach)} declined or cancelled this booking. You can browse their availability and book another time.</p>`,
        ].join("\n"),
        "Browse availability",
        ctaUrl
      ),
    },
    completed: {
      subject: `Session completed with ${coach}`,
      body: [
        greeting,
        "",
        `Your session with ${coach} is complete!`,
        "",
        `Time: ${slotStr}`,
        "",
        "Thank you for training with Apex Sports! We'd love to hear how it went — consider leaving a review.",
        ctaUrl ? `View booking: ${ctaUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      bodyHtml: htmlEmail(
        [
          `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
          `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Great session!</p>`,
          `<p style="margin: 0 0 4px;">${statusBadge("completed")}</p>`,
          card,
          `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">Thank you for training with Apex Sports! We'd love to hear how it went — consider leaving a review.</p>`,
        ].join("\n"),
        "Leave a review",
        ctaUrl
      ),
    },
  };

  const { subject, body, bodyHtml } = statusMessages[newStatus];

  try {
    await sendEmail({ to: athleteEmail, subject, text: body, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendBookingStatusToAthlete failed:", err);
  }
}

// --- Payment link email ---

export interface PaymentLinkToAthleteParams {
  athleteEmail: string;
  athleteName?: string;
  coachDisplayName: string;
  amountCents: number;
  currency: string;
  paymentUrl: string;
  slotStart: string;
  slotEnd: string;
  /** When true, the email mentions the session is complete and asks for payment in one message. */
  sessionCompleted?: boolean;
}

export async function sendPaymentLinkToAthlete(params: PaymentLinkToAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, amountCents, currency, paymentUrl, slotStart, slotEnd, sessionCompleted } = params;
  const name = athleteName?.trim() || "there";
  const coach = coachDisplayName.trim();
  const amountStr = `$${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const greeting = `Hi ${name},`;

  const subject = sessionCompleted
    ? `Your session with ${coach} is complete`
    : `${coach} sent you a payment request`;
  const bodyText = sessionCompleted
    ? [
        greeting,
        "",
        `Your session with ${coach} is complete!`,
        "",
        `Time: ${slotStr}`,
        `Amount: ${amountStr}`,
        "",
        `View details and complete your payment: ${paymentUrl}`,
        "",
        "Thank you,",
        "Apex Sports",
      ].join("\n")
    : [
        greeting,
        "",
        `${coach} sent a payment request for your coaching session.`,
        "",
        `Session: ${slotStr}`,
        `Amount: ${amountStr}`,
        "",
        `View details: ${paymentUrl}`,
        "",
        "Thank you,",
        "Apex Sports",
      ].join("\n");

  const card = infoCard([
    iconRow("📅", "Session", escapeHtml(slotStr)),
    iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
    iconRow("💳", "Amount", `<strong style="color: ${SLATE_900}; font-size: 16px;">${escapeHtml(amountStr)}</strong>`),
  ]);

  const bodyHtml = sessionCompleted
    ? htmlEmail(
        [
          `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
          `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Your session is complete!</p>`,
          `<p style="margin: 0 0 4px;">${statusBadge("completed")}</p>`,
          card,
          `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">You can complete your payment using the button below.</p>`,
        ].join("\n"),
        "View details & pay",
        paymentUrl
      )
    : htmlEmail(
        [
          `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
          `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Your coach sent a payment request</p>`,
          card,
          `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};"><strong>${escapeHtml(coach)}</strong> has requested payment for your coaching session.</p>`,
        ].join("\n"),
        "View details & pay",
        paymentUrl
      );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendPaymentLinkToAthlete failed:", err);
  }
}

export interface PriceDropNotificationParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  slotStart: string;
  slotEnd: string;
  newPerPersonRate: number;
  headcount: number;
  bookingId: string;
}

export async function sendPriceDropNotification(params: PriceDropNotificationParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, slotStart, slotEnd, newPerPersonRate, headcount, bookingId } = params;
  const name = athleteName?.trim() || "there";
  const coach = coachDisplayName?.trim() || "your coach";
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const rateStr = `$${newPerPersonRate}/hr`;
  const bookingUrl = myBookingsUrl ? `${myBookingsUrl.replace("/bookings", "")}/bookings/${bookingId}` : "";

  const subject = `Your rate just dropped to ${rateStr}!`;
  const bodyText = [
    `Hi ${name},`,
    "",
    `Great news! Another athlete joined your session with ${coach}, so your per-person rate dropped.`,
    "",
    `Session: ${slotStr}`,
    `Athletes: ${headcount}`,
    `Your new rate: ${rateStr} per person`,
    "",
    bookingUrl ? `View your booking: ${bookingUrl}` : null,
    "",
    "Apex Sports",
  ].filter((l) => l !== null).join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">Hi ${escapeHtml(name)},</p>`,
      `<div style="margin: 0 0 20px; padding: 16px 20px; background: #dcfce7; border-radius: 12px; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.05em;">Rate dropped</p>
        <p style="margin: 0; font-size: 28px; font-weight: 800; color: #166534;">${escapeHtml(rateStr)}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #15803d;">per person</p>
      </div>`,
      `<p style="margin: 0 0 8px; font-size: 15px; color: ${SLATE_700};">Another athlete joined your session with <strong>${escapeHtml(coach)}</strong>, so everyone pays less!</p>`,
      infoCard([
        iconRow("📅", "Session", escapeHtml(slotStr)),
        iconRow("👥", "Athletes", `<strong>${headcount}</strong>`),
        iconRow("💲", "New rate", `<strong>${escapeHtml(rateStr)}</strong> per person`),
      ]),
    ].join("\n"),
    "View booking",
    bookingUrl
  );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendPriceDropNotification failed:", err);
  }
}

export interface AthleteCancelledToCoachParams {
  coachEmail: string;
  coachPhone?: string | null;
  athleteName: string | null;
  slotStart: string;
  slotEnd: string;
  previousStatus: string;
  bookingId: string;
}

export async function sendAthleteCancelledToCoach(params: AthleteCancelledToCoachParams): Promise<void> {
  const { coachEmail, coachPhone, athleteName, slotStart, slotEnd, previousStatus, bookingId } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const athlete = athleteName?.trim() || "An athlete";
  const ctaUrl = bookingId && appUrl ? `${appUrl}/bookings/${bookingId}` : myBookingsUrl;
  const action = previousStatus === "confirmed" ? "cancelled their confirmed booking" : "withdrew their booking request";

  const subject = `${athlete} cancelled their booking`;
  const bodyText = [
    `${athlete} ${action} for ${slotStr}.`,
    "",
    "The spot is now available for other athletes to book.",
    ctaUrl ? `View booking: ${ctaUrl}` : null,
  ].filter(Boolean).join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 4px; font-size: 14px; color: ${SLATE_500};">Booking update</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Booking cancelled</p>`,
      `<p style="margin: 0 0 4px;">${statusBadge("cancelled")}</p>`,
      infoCard([
        iconRow("👤", "Athlete", `<strong>${escapeHtml(athlete)}</strong>`),
        iconRow("📅", "When", escapeHtml(slotStr)),
      ]),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">${escapeHtml(athlete)} ${escapeHtml(action)}. The spot is now available for other athletes.</p>`,
    ].join("\n"),
    "View booking",
    ctaUrl
  );

  try {
    await sendEmail({ to: coachEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendAthleteCancelledToCoach failed:", err);
  }

  if (sendSms && coachPhone?.trim()) {
    try {
      const phone = normalizePhone(coachPhone.trim());
      await sns.send(
        new PublishCommand({
          PhoneNumber: phone,
          Message: `ApexSports: ${athlete} cancelled their booking for ${formatSlotTime(slotStart)}. The spot is now open.`,
          MessageAttributes: { "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" } },
        })
      );
    } catch (err) {
      console.error("[notifications] sendAthleteCancelledToCoach SMS failed:", err);
    }
  }
}

// --- Payment confirmed email (athlete) ---

export interface PaymentConfirmedToAthleteParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  amountCents: number;
  currency: string;
  slotStart: string;
  slotEnd: string;
  bookingId: string;
}

export async function sendPaymentConfirmedToAthlete(params: PaymentConfirmedToAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, amountCents, currency, slotStart, slotEnd, bookingId } = params;
  const name = athleteName?.trim() || "there";
  const coach = coachDisplayName.trim();
  const amountStr = `$${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const bookingUrl = bookingId && appUrl ? `${appUrl}/bookings/${bookingId}` : myBookingsUrl;
  const greeting = `Hi ${name},`;

  const subject = `Your session payment with ${coach} is confirmed`;
  const bodyText = [
    greeting,
    "",
    `Your payment of ${amountStr} for your session with ${coach} has been confirmed.`,
    "",
    `Session: ${slotStr}`,
    `Amount paid: ${amountStr}`,
    "",
    bookingUrl ? `View your booking: ${bookingUrl}` : null,
    "",
    "Thank you for training with Apex Sports!",
  ].filter((l) => l !== null).join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Payment confirmed</p>`,
      `<div style="margin: 0 0 20px; padding: 16px 20px; background: #dcfce7; border-radius: 12px; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.05em;">Paid</p>
        <p style="margin: 0; font-size: 28px; font-weight: 800; color: #166534;">${escapeHtml(amountStr)}</p>
      </div>`,
      infoCard([
        iconRow("📅", "Session", escapeHtml(slotStr)),
        iconRow("🏋️", "Coach", `<strong>${escapeHtml(coach)}</strong>`),
        iconRow("💳", "Amount", `<strong>${escapeHtml(amountStr)}</strong>`),
      ]),
      `<p style="margin: 0; font-size: 15px; color: ${SLATE_700};">Thank you for training with Apex Sports!</p>`,
    ].join("\n"),
    "View booking",
    bookingUrl
  );

  try {
    await sendEmail({ to: athleteEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendPaymentConfirmedToAthlete failed:", err);
  }
}

// --- Payment received email (coach) ---

export interface PaymentReceivedToCoachParams {
  coachEmail: string;
  coachDisplayName: string;
  athleteName?: string | null;
  amountCents: number;
  currency: string;
  slotStart: string;
  slotEnd: string;
  bookingId: string;
}

export async function sendPaymentReceivedToCoach(params: PaymentReceivedToCoachParams): Promise<void> {
  const { coachEmail, coachDisplayName, athleteName, amountCents, currency, slotStart, slotEnd, bookingId } = params;
  const coach = coachDisplayName?.trim() || "Coach";
  const athlete = athleteName?.trim() || "An athlete";
  const amountStr = `$${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const bookingUrl = bookingId && appUrl ? `${appUrl}/bookings/${bookingId}` : myBookingsUrl;
  const greeting = `Hi ${coach},`;

  const subject = `${athlete} completed their session payment`;
  const bodyText = [
    greeting,
    "",
    `${athlete} has paid ${amountStr} for your session.`,
    "",
    `Session: ${slotStr}`,
    `Athlete: ${athlete}`,
    `Amount: ${amountStr}`,
    "",
    bookingUrl ? `View booking: ${bookingUrl}` : null,
    "",
    "Apex Sports",
  ].filter((l) => l !== null).join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px; font-size: 15px; color: ${SLATE_700};">${escapeHtml(greeting)}</p>`,
      `<p style="margin: 0 0 6px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Payment received</p>`,
      `<div style="margin: 0 0 20px; padding: 16px 20px; background: #dcfce7; border-radius: 12px; text-align: center;">
        <p style="margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.05em;">Received</p>
        <p style="margin: 0; font-size: 28px; font-weight: 800; color: #166534;">${escapeHtml(amountStr)}</p>
        <p style="margin: 4px 0 0; font-size: 13px; color: #15803d;">from ${escapeHtml(athlete)}</p>
      </div>`,
      infoCard([
        iconRow("👤", "Athlete", `<strong>${escapeHtml(athlete)}</strong>`),
        iconRow("📅", "Session", escapeHtml(slotStr)),
        iconRow("💳", "Amount", `<strong>${escapeHtml(amountStr)}</strong>`),
      ]),
    ].join("\n"),
    "View booking",
    bookingUrl
  );

  try {
    await sendEmail({ to: coachEmail, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendPaymentReceivedToCoach failed:", err);
  }
}

// --- Admin: new coach signup ---

const ADMIN_EMAIL = "michaelmoser01@gmail.com";

export interface NewCoachSignupAdminParams {
  coachName: string;
  sports: string[];
  cities: string[];
}

export async function sendNewCoachSignupAdmin(params: NewCoachSignupAdminParams): Promise<void> {
  const { coachName, sports, cities } = params;
  const name = coachName?.trim() || "Unknown";

  const subject = `New coach signed up: ${name}`;
  const bodyText = [
    `A new coach just signed up on ApexSports!`,
    "",
    `Name: ${name}`,
    `Sports: ${sports?.length ? sports.join(", ") : "None listed"}`,
    `Cities: ${cities?.length ? cities.join(", ") : "None listed"}`,
  ].join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 4px; font-size: 14px; color: ${SLATE_500};">New coach signup</p>`,
      `<p style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: ${SLATE_900};">Congrats — you have a new coach!</p>`,
      infoCard([
        iconRow("👤", "Name", `<strong>${escapeHtml(name)}</strong>`),
        iconRow("⚽", "Sports", escapeHtml(sports?.length ? sports.join(", ") : "None listed")),
        iconRow("📍", "Cities", escapeHtml(cities?.length ? cities.join(", ") : "None listed")),
      ]),
    ].join("\n")
  );

  try {
    await sendEmail({ to: ADMIN_EMAIL, subject, text: bodyText, html: bodyHtml });
  } catch (err) {
    console.error("[notifications] sendNewCoachSignupAdmin failed:", err);
  }
}
