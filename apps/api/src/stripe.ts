import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
export const stripe = secretKey ? new Stripe(secretKey, { apiVersion: "2023-10-16" }) : null;

const FEE_PERCENT = Math.min(100, Math.max(0, Number(process.env.STRIPE_PLATFORM_FEE_PERCENT) || 10));

export function isStripeEnabled(): boolean {
  return !!stripe && !!secretKey;
}

/** Get or create Stripe Customer for an athlete (User). */
export async function getOrCreateStripeCustomerId(
  stripe: Stripe,
  userId: string,
  email: string,
  existingCustomerId: string | null
): Promise<string> {
  if (existingCustomerId) return existingCustomerId;
  const customer = await stripe.customers.create({
    email: email.trim() || undefined,
    metadata: { apex_user_id: userId },
  });
  return customer.id;
}

/** Create a PaymentIntent with manual capture (auth hold only).
 * When paymentMethodId is provided, attaches it to the customer then confirms on the server. */
export async function createPaymentIntentAuthOnly(params: {
  amountCents: number;
  currency: string;
  customerId: string;
  paymentMethodId?: string;
  idempotencyKey: string;
  metadata: { bookingId: string };
}): Promise<{ clientSecret: string | null; paymentIntentId: string; status: string }> {
  if (!stripe) throw new Error("Stripe not configured");
  const confirm = !!params.paymentMethodId;
  if (params.paymentMethodId) {
    try {
      await stripe.paymentMethods.attach(params.paymentMethodId, {
        customer: params.customerId,
      });
    } catch (err) {
      const msg = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
      if (msg !== "resource_already_attached_to_customer") throw err;
    }
  }
  const pi = await stripe.paymentIntents.create(
    {
      amount: params.amountCents,
      currency: params.currency,
      customer: params.customerId,
      payment_method: params.paymentMethodId || undefined,
      capture_method: "manual",
      metadata: params.metadata,
      confirm,
      // Card-only; no redirect-based methods so we don't need return_url.
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    },
    { idempotencyKey: params.idempotencyKey }
  );
  return {
    clientSecret: pi.client_secret ?? null,
    paymentIntentId: pi.id,
    status: pi.status,
  };
}

/** Capture a previously authorized PaymentIntent. */
export async function capturePaymentIntent(paymentIntentId: string): Promise<void> {
  if (!stripe) throw new Error("Stripe not configured");
  await stripe.paymentIntents.capture(paymentIntentId);
}

/** Transfer to coach's Connect account (after capture). Platform keeps fee. */
export async function transferToConnectAccount(params: {
  amountCents: number;
  currency: string;
  connectAccountId: string;
  transferGroup?: string;
}): Promise<string> {
  if (!stripe) throw new Error("Stripe not configured");
  const feeCents = Math.round((params.amountCents * FEE_PERCENT) / 100);
  const transferAmount = params.amountCents - feeCents;
  if (transferAmount <= 0) return "";
  const transfer = await stripe.transfers.create({
    amount: transferAmount,
    currency: params.currency,
    destination: params.connectAccountId,
    transfer_group: params.transferGroup,
  });
  return transfer.id;
}

/** Cancel a PaymentIntent (release auth hold). */
export async function cancelPaymentIntent(paymentIntentId: string): Promise<void> {
  if (!stripe) throw new Error("Stripe not configured");
  await stripe.paymentIntents.cancel(paymentIntentId);
}
