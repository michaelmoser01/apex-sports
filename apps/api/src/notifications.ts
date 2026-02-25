/**
 * Booking notifications via AWS SES (email) and SNS (SMS).
 * Failures are logged and do not affect the HTTP response.
 */

import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const ses = new SESClient({ region: process.env.AWS_REGION ?? "us-east-1" });
const sns = new SNSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
const fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? "notifications@apexsports.example.com";
const sendSms = process.env.SEND_SMS !== "false";
const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
const myBookingsUrl = appUrl ? `${appUrl}/bookings` : "";
/** IANA timezone for email times (slot times are stored UTC). Default US/Pacific. */
const notificationTimeZone = process.env.NOTIFICATION_TIMEZONE ?? "America/Los_Angeles";

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

/**
 * Shared HTML email wrapper: Apex Sports branding, content block, optional CTA.
 * Inline styles for email client compatibility.
 */
function htmlEmail(contentHtml: string, ctaLabel?: string): string {
  const ctaBlock =
    myBookingsUrl && ctaLabel
      ? `
    <p style="margin: 28px 0 0; text-align: center;">
      <a href="${escapeHtml(myBookingsUrl)}" style="display: inline-block; padding: 12px 24px; background: #0f766e; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px; border-radius: 8px;">${escapeHtml(ctaLabel)}</a>
    </p>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apex Sports</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #334155; background: #f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background: #ffffff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden;">
          <tr>
            <td style="padding: 28px 32px 24px; background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%);">
              <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">Apex Sports</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 32px;">
${contentHtml}${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b;">
              You're receiving this because you have an Apex Sports account.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface BookingRequestedToCoachParams {
  coachEmail: string;
  coachPhone?: string | null;
  athleteName: string | null;
  slotStart: string;
  slotEnd: string;
  message?: string | null;
  bookingId: string;
}

export async function sendBookingRequestedToCoach(params: BookingRequestedToCoachParams): Promise<void> {
  const { coachEmail, coachPhone, athleteName, slotStart, slotEnd, message, bookingId } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const athlete = athleteName?.trim() || "An athlete";

  const subject = `New booking request from ${athlete}`;
  const bodyText = [
    `${athlete} requested a booking with you.`,
    "",
    `Time: ${slotStr}`,
    message?.trim() ? `Message: ${message.trim()}` : null,
    "",
    "Log in to ApexSports to accept or decline.",
    myBookingsUrl ? `My Bookings: ${myBookingsUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px;">${escapeHtml(athlete)} requested a booking with you.</p>`,
      `<p style="margin: 0 0 16px;"><strong>Time:</strong> ${escapeHtml(slotStr)}</p>`,
      message?.trim() ? `<p style="margin: 0 0 16px;"><strong>Message:</strong> ${escapeHtml(message.trim())}</p>` : "",
      `<p style="margin: 0 0 0;">Log in to Apex Sports to accept or decline.</p>`,
    ].join("\n"),
    "View My Bookings"
  );

  try {
    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [coachEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: bodyText, Charset: "UTF-8" },
            Html: { Data: bodyHtml, Charset: "UTF-8" },
          },
        },
      })
    );
  } catch (err) {
    console.error("[notifications] sendBookingRequestedToCoach email failed:", err);
  }

  if (sendSms && coachPhone?.trim()) {
    try {
      const phone = normalizePhone(coachPhone.trim());
      const smsBody = `ApexSports: ${athlete} requested a booking for ${formatSlotTime(slotStart)}. Log in to accept or decline.`;
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

export interface BookingRequestSubmittedToAthleteParams {
  athleteEmail: string;
  athleteName?: string | null;
  coachDisplayName: string;
  slotStart: string;
  slotEnd: string;
}

export async function sendBookingRequestSubmittedToAthlete(params: BookingRequestSubmittedToAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, slotStart, slotEnd } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "your coach";

  const subject = "Booking request sent – we'll notify you when they respond";
  const bodyText = [
    athleteName?.trim() ? `Hi ${athleteName.trim()},` : "Hi,",
    "",
    `Your booking request has been sent to ${coach}.`,
    "",
    `Requested time: ${slotStr}`,
    "",
    "We'll email you when they accept or decline.",
    myBookingsUrl ? `My Bookings: ${myBookingsUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const bodyHtml = htmlEmail(
    [
      `<p style="margin: 0 0 16px;">${athleteName?.trim() ? `Hi ${escapeHtml(athleteName.trim())},` : "Hi,"}</p>`,
      `<p style="margin: 0 0 16px;">Your booking request has been sent to ${escapeHtml(coach)}.</p>`,
      `<p style="margin: 0 0 16px;"><strong>Requested time:</strong> ${escapeHtml(slotStr)}</p>`,
      `<p style="margin: 0 0 0;">We'll email you when they accept or decline.</p>`,
    ].join("\n"),
    "My Bookings"
  );

  try {
    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [athleteEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: bodyText, Charset: "UTF-8" },
            Html: { Data: bodyHtml, Charset: "UTF-8" },
          },
        },
      })
    );
  } catch (err) {
    console.error("[notifications] sendBookingRequestSubmittedToAthlete failed:", err);
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
}

export async function sendBookingStatusToAthlete(params: BookingStatusToAthleteParams): Promise<void> {
  const { athleteEmail, athleteName, coachDisplayName, newStatus, slotStart, slotEnd } = params;
  const slotStr = `${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`;
  const coach = coachDisplayName?.trim() || "Your coach";

  const statusMessages: Record<
    BookingStatusForAthlete,
    { subject: string; body: string; bodyHtml: string }
  > = {
    confirmed: {
      subject: `Booking confirmed with ${coach}`,
      body: [
        `${coach} accepted your booking.`,
        "",
        `Time: ${slotStr}`,
        "",
        "See you then!",
        myBookingsUrl ? `My Bookings: ${myBookingsUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      bodyHtml: htmlEmail(
        [
          `<p style="margin: 0 0 16px;">${escapeHtml(coach)} accepted your booking.</p>`,
          `<p style="margin: 0 0 16px;"><strong>Time:</strong> ${escapeHtml(slotStr)}</p>`,
          `<p style="margin: 0 0 0;">See you then!</p>`,
        ].join("\n"),
        "My Bookings"
      ),
    },
    cancelled: {
      subject: `Booking cancelled – ${coach}`,
      body: [
        `${coach} declined or cancelled your booking.`,
        "",
        `Time: ${slotStr}`,
        "",
        "Log in to ApexSports to book another time.",
        myBookingsUrl ? `My Bookings: ${myBookingsUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      bodyHtml: htmlEmail(
        [
          `<p style="margin: 0 0 16px;">${escapeHtml(coach)} declined or cancelled your booking.</p>`,
          `<p style="margin: 0 0 16px;"><strong>Time:</strong> ${escapeHtml(slotStr)}</p>`,
          `<p style="margin: 0 0 0;">Log in to Apex Sports to book another time.</p>`,
        ].join("\n"),
        "My Bookings"
      ),
    },
    completed: {
      subject: `Session completed with ${coach}`,
      body: [
        `Your session with ${coach} is marked complete.`,
        "",
        `Time: ${slotStr}`,
        "",
        "Thank you for booking with ApexSports! Consider leaving a review.",
        myBookingsUrl ? `My Bookings: ${myBookingsUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      bodyHtml: htmlEmail(
        [
          `<p style="margin: 0 0 16px;">Your session with ${escapeHtml(coach)} is marked complete.</p>`,
          `<p style="margin: 0 0 16px;"><strong>Time:</strong> ${escapeHtml(slotStr)}</p>`,
          `<p style="margin: 0 0 0;">Thank you for booking with Apex Sports! Consider leaving a review.</p>`,
        ].join("\n"),
        "My Bookings"
      ),
    },
  };

  const { subject, body, bodyHtml } = statusMessages[newStatus];

  try {
    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [athleteEmail] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: body, Charset: "UTF-8" },
            Html: { Data: bodyHtml, Charset: "UTF-8" },
          },
        },
      })
    );
  } catch (err) {
    console.error("[notifications] sendBookingStatusToAthlete failed:", err);
  }
}
