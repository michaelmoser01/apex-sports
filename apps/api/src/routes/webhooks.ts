import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { prisma } from "../db.js";
import { stripe } from "../stripe.js";

const router = Router();
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Process Stripe event (shared by Express and Lambda handler). Awaits DB updates so they complete before response. */
async function processStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.bookingId;
      if (bookingId) {
        const paymentStatus = pi.status === "succeeded" ? "succeeded" : "authorized";
        await prisma.booking
          .updateMany({
            where: { id: bookingId, stripePaymentIntentId: pi.id },
            data: { paymentStatus },
          })
          .catch((err) => console.error("[webhooks] update booking paymentStatus failed:", err));
      }
      break;
    }
    case "payment_intent.amount_capturable_updated": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.bookingId;
      if (bookingId && pi.status === "requires_capture") {
        await prisma.booking
          .updateMany({
            where: { id: bookingId, stripePaymentIntentId: pi.id },
            data: { paymentStatus: "authorized" },
          })
          .catch((err) => console.error("[webhooks] update booking paymentStatus failed:", err));
      }
      break;
    }
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const bookingId = pi.metadata?.bookingId;
      if (bookingId) {
        const paymentStatus = event.type === "payment_intent.canceled" ? "canceled" : "failed";
        await prisma.booking
          .updateMany({
            where: { id: bookingId, stripePaymentIntentId: pi.id },
            data: { paymentStatus },
          })
          .catch((err) => console.error("[webhooks] update booking paymentStatus failed:", err));
      }
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === "paid") {
        const bookingId = session.metadata?.bookingId as string | undefined;
        if (bookingId && session.id) {
          await prisma.booking
            .updateMany({
              where: { id: bookingId, stripePaymentIntentId: session.id },
              data: { paymentStatus: "succeeded" },
            })
            .catch((err) => console.error("[webhooks] update booking from checkout.session.completed failed:", err));
        }
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Handle Stripe webhook from raw body (use from Lambda handler so body isn't parsed).
 * Returns [statusCode, body].
 */
export async function handleStripeWebhookRaw(
  rawBody: string | Buffer,
  signature: string
): Promise<{ statusCode: number; body: string }> {
  if (!webhookSecret || !stripe) {
    return { statusCode: 501, body: "Stripe not configured" };
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhooks] Stripe signature verification failed:", message);
    return { statusCode: 400, body: `Webhook Error: ${message}` };
  }
  await processStripeEvent(event);
  return { statusCode: 200, body: "" };
}

export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!webhookSecret || !stripe) {
    res.status(501).send("Stripe not configured");
    return;
  }
  const sig = req.headers["stripe-signature"];
  if (!sig || typeof sig !== "string") {
    res.status(400).send("Missing stripe-signature");
    return;
  }
  const body = req.body;
  const raw = typeof body === "string" ? body : Buffer.isBuffer(body) ? body : undefined;
  if (raw === undefined) {
    console.error("[webhooks] Raw body required for Stripe webhook (use Lambda path or mount express.raw before json)");
    res.status(500).send("Invalid body");
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[webhooks] Stripe signature verification failed:", message);
    res.status(400).send(`Webhook Error: ${message}`);
    return;
  }
  await processStripeEvent(event);
  res.sendStatus(200);
}

export default router;
