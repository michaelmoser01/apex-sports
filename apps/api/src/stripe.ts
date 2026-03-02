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
 * When paymentMethodId is provided, attaches it to the customer then confirms on the server.
 * When connectAccountId is set, uses a destination charge so Stripe splits on capture (no platform balance needed). */
export async function createPaymentIntentAuthOnly(params: {
  amountCents: number;
  currency: string;
  customerId: string;
  paymentMethodId?: string;
  idempotencyKey: string;
  metadata: { bookingId: string };
  /** If set, destination charge: on capture Stripe sends (amount - applicationFeeCents) to this Connect account and keeps the fee on the platform. */
  connectAccountId?: string;
  applicationFeeCents?: number;
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
  const feeCents =
    params.applicationFeeCents ?? (params.connectAccountId ? Math.round((params.amountCents * FEE_PERCENT) / 100) : 0);
  const piParams: Stripe.PaymentIntentCreateParams = {
    amount: params.amountCents,
    currency: params.currency,
    customer: params.customerId,
    payment_method: params.paymentMethodId || undefined,
    capture_method: "manual",
    metadata: params.metadata,
    confirm,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  };
  if (params.connectAccountId && feeCents >= 0 && feeCents < params.amountCents) {
    piParams.transfer_data = { destination: params.connectAccountId };
    piParams.application_fee_amount = feeCents;
  }
  const pi = await stripe.paymentIntents.create(piParams, { idempotencyKey: params.idempotencyKey });
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

/** Create a Stripe Checkout Session for a coach plan subscription. Charges the platform Stripe account (monthly fee). */
export async function createPlanCheckoutSession(params: {
  customerEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: { userId: string; planId: string };
}): Promise<{ url: string }> {
  if (!stripe) throw new Error("Stripe not configured");
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: params.customerEmail.trim() || undefined,
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: params.metadata,
  });
  const url = session.url;
  if (!url) throw new Error("Stripe did not return a checkout URL");
  return { url };
}

/** Create a subscription for a coach plan using an existing payment method (inline card form). Confirms the first invoice's payment intent so the card is charged; returns clientSecret if 3DS is required. */
export async function createCoachPlanSubscription(params: {
  customerId: string;
  paymentMethodId: string;
  priceId: string;
  metadata: { userId: string; planId: string };
}): Promise<{ subscriptionId: string; clientSecret?: string; status: string }> {
  if (!stripe) throw new Error("Stripe not configured");
  try {
    await stripe.paymentMethods.attach(params.paymentMethodId, {
      customer: params.customerId,
    });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code: string }).code : "";
    if (code !== "resource_already_attached_to_customer") throw err;
  }
  const sub = await stripe.subscriptions.create({
    customer: params.customerId,
    items: [{ price: params.priceId }],
    default_payment_method: params.paymentMethodId,
    payment_behavior: "default_incomplete",
    metadata: params.metadata,
    expand: ["latest_invoice.payment_intent"],
  });
  let pi = (sub.latest_invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent })?.payment_intent as Stripe.PaymentIntent | undefined;

  if (pi?.id && pi.status === "requires_confirmation") {
    const confirmed = await stripe.paymentIntents.confirm(pi.id, {
      payment_method: params.paymentMethodId,
    });
    pi = confirmed;
  }

  const subUpdated =
    sub.status === "active"
      ? sub
      : await stripe.subscriptions.retrieve(sub.id, { expand: ["latest_invoice.payment_intent"] });
  const invoiceUpdated = subUpdated.latest_invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent };
  const piUpdated = invoiceUpdated?.payment_intent as Stripe.PaymentIntent | undefined;
  const status = subUpdated.status;
  const clientSecret =
    piUpdated?.status === "requires_action" && piUpdated.client_secret ? piUpdated.client_secret : undefined;

  return {
    subscriptionId: sub.id,
    clientSecret: clientSecret ?? undefined,
    status,
  };
}
