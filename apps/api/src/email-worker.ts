import type { SQSEvent, SQSBatchResponse } from "aws-lambda";
import type { NotificationType } from "./emailQueue.js";
import {
  sendAthleteMessageToCoach,
  sendNewAthleteConnectedToCoach,
  sendBookingRequestedToCoach,
  sendCoachBookedAthlete,
  sendCoachInviteToBookSlot,
  sendBookingRequestSubmittedToAthlete,
  sendGroupInviteToAthlete,
  sendBookingStatusToAthlete,
  sendPaymentLinkToAthlete,
  sendPriceDropNotification,
  sendAthleteCancelledToCoach,
  sendPaymentConfirmedToAthlete,
  sendPaymentReceivedToCoach,
} from "./notifications.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const dispatch: Record<NotificationType, (p: any) => Promise<void>> = {
  athlete_message_to_coach: sendAthleteMessageToCoach,
  new_athlete_connected: sendNewAthleteConnectedToCoach,
  booking_requested: sendBookingRequestedToCoach,
  coach_booked_athlete: sendCoachBookedAthlete,
  coach_invite_to_book: sendCoachInviteToBookSlot,
  booking_submitted: sendBookingRequestSubmittedToAthlete,
  group_invite: sendGroupInviteToAthlete,
  booking_status: sendBookingStatusToAthlete,
  payment_link: sendPaymentLinkToAthlete,
  price_drop: sendPriceDropNotification,
  athlete_cancelled: sendAthleteCancelledToCoach,
  payment_confirmed: sendPaymentConfirmedToAthlete,
  payment_received: sendPaymentReceivedToCoach,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: SQSBatchResponse["batchItemFailures"] = [];

  for (const record of event.Records) {
    try {
      const { type, payload } = JSON.parse(record.body) as {
        type: NotificationType;
        payload: Record<string, unknown>;
      };
      const fn = dispatch[type];
      if (!fn) {
        console.error(`[email-worker] Unknown notification type: ${type}`);
        continue;
      }
      await fn(payload);
    } catch (err) {
      console.error(`[email-worker] Failed to process record ${record.messageId}:`, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};
