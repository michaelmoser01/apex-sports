import serverless from "serverless-http";
import type { Application } from "express";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayProxyEvent, Context } from "aws-lambda";

let appPromise: Promise<Application> | null = null;

async function ensureDatabaseUrl(): Promise<void> {
  if (process.env.DATABASE_URL) return;
  const secretArn = process.env.DB_SECRET_ARN;
  const endpoint = process.env.DB_CLUSTER_ENDPOINT;
  const dbName = process.env.DB_NAME ?? "apexsports";
  if (!secretArn || !endpoint) return;

  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(res.SecretString ?? "{}") as { username?: string; password?: string };
  const user = secret.username ?? "postgres";
  const password = encodeURIComponent(secret.password ?? "");
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${endpoint}:5432/${dbName}`;
}

/** Load Stripe keys from Secrets Manager when STRIPE_SECRET_ARN is set (deployed env). */
async function ensureStripeSecrets(): Promise<void> {
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET) return;
  const secretArn = process.env.STRIPE_SECRET_ARN;
  if (!secretArn) return;

  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(res.SecretString ?? "{}") as {
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
  };
  if (secret.STRIPE_SECRET_KEY) process.env.STRIPE_SECRET_KEY = secret.STRIPE_SECRET_KEY;
  if (secret.STRIPE_WEBHOOK_SECRET) process.env.STRIPE_WEBHOOK_SECRET = secret.STRIPE_WEBHOOK_SECRET;
}

async function getApp(): Promise<Application> {
  if (!appPromise) {
    await ensureDatabaseUrl();
    await ensureStripeSecrets();
    const m = await import("./app.js");
    appPromise = Promise.resolve(m.default);
  }
  return appPromise;
}

function isStripeWebhook(event: APIGatewayProxyEvent): boolean {
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  const path = event.requestContext?.http?.path ?? event.rawPath ?? event.path ?? "";
  const normalized = path.replace(/^\/dev\/?/, "/").replace(/^\/prod\/?/, "/");
  return method === "POST" && (normalized === "/webhooks/stripe" || path.endsWith("/webhooks/stripe"));
}

export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
  // Set DATABASE_URL (and Stripe secrets) before any Prisma or app code runs
  await ensureDatabaseUrl();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set: ensure DB_SECRET_ARN and DB_CLUSTER_ENDPOINT are set on the Lambda");
    return {
      statusCode: 503,
      body: JSON.stringify({ error: "Database not configured" }),
      headers: { "Content-Type": "application/json" },
    };
  }

  if (isStripeWebhook(event)) {
    await ensureStripeSecrets();
    const rawBody =
      typeof event.body === "string"
        ? event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf8")
          : event.body
        : "";
    const sig = (event.headers?.["stripe-signature"] ?? event.headers?.["Stripe-Signature"]) ?? "";
    const { handleStripeWebhookRaw } = await import("./routes/webhooks.js");
    const result = await handleStripeWebhookRaw(rawBody, sig);
    return {
      statusCode: result.statusCode,
      body: result.body,
      headers: result.statusCode === 200 ? { "Content-Length": "0" } : { "Content-Type": "text/plain" },
    };
  }
  const app = await getApp();
  return serverless(app, { binary: true })(event, context);
};
