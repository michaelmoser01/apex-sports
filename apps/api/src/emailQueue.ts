import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

export type NotificationType =
  | "athlete_message_to_coach"
  | "new_athlete_connected"
  | "booking_requested"
  | "coach_booked_athlete"
  | "coach_invite_to_book"
  | "booking_submitted"
  | "group_invite"
  | "booking_status"
  | "payment_link"
  | "price_drop"
  | "athlete_cancelled"
  | "payment_confirmed"
  | "payment_received"
  | "new_coach_signup"
  | "new_message";

const queueUrl = process.env.EMAIL_QUEUE_URL;
let sqs: SQSClient | null = null;

function getSqs(): SQSClient {
  if (!sqs) sqs = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  return sqs;
}

/**
 * Enqueue a notification for async delivery via the email worker Lambda.
 * Falls back to direct (synchronous) send when EMAIL_QUEUE_URL is not set (local dev).
 */
export async function queueEmail(
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!queueUrl) {
    const dispatch = (await import("./notifications.js")) as Record<string, (p: never) => Promise<void>>;
    const fnMap: Record<NotificationType, string> = {
      athlete_message_to_coach: "sendAthleteMessageToCoach",
      new_athlete_connected: "sendNewAthleteConnectedToCoach",
      booking_requested: "sendBookingRequestedToCoach",
      coach_booked_athlete: "sendCoachBookedAthlete",
      coach_invite_to_book: "sendCoachInviteToBookSlot",
      booking_submitted: "sendBookingRequestSubmittedToAthlete",
      group_invite: "sendGroupInviteToAthlete",
      booking_status: "sendBookingStatusToAthlete",
      payment_link: "sendPaymentLinkToAthlete",
      price_drop: "sendPriceDropNotification",
      athlete_cancelled: "sendAthleteCancelledToCoach",
      payment_confirmed: "sendPaymentConfirmedToAthlete",
      payment_received: "sendPaymentReceivedToCoach",
      new_coach_signup: "sendNewCoachSignupAdmin",
      new_message: "sendNewMessageEmail",
    };
    const fn = dispatch[fnMap[type]];
    if (fn) await fn(payload as never);
    return;
  }

  await getSqs().send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ type, payload }),
    }),
  );
}
