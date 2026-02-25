/**
 * Lambda handler to seed the marketplace. Runs inside the VPC with access to Aurora.
 * Invoke manually after deploy when the DB is not reachable from your machine.
 *
 * Invoke:
 *   aws lambda invoke --function-name apex-sports-<stage>-seed --payload '{"count":25}' out.json && cat out.json
 */
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { PrismaClient } from "@prisma/client";
import { runSeed } from "./seed-marketplace-logic.js";

async function getDatabaseUrl(): Promise<string> {
  const secretArn = process.env.DB_SECRET_ARN;
  const endpoint = process.env.DB_CLUSTER_ENDPOINT;
  const dbName = process.env.DB_NAME ?? "apexsports";
  if (!secretArn || !endpoint) {
    throw new Error("Missing DB_SECRET_ARN or DB_CLUSTER_ENDPOINT");
  }
  const client = new SecretsManagerClient({});
  const res = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
  const secret = JSON.parse(res.SecretString ?? "{}") as { username?: string; password?: string };
  const user = secret.username ?? "postgres";
  const password = encodeURIComponent(secret.password ?? "");
  return `postgresql://${user}:${password}@${endpoint}:5432/${dbName}`;
}

export type SeedHandlerEvent = { count?: number };
export type SeedHandlerResult = { seeded: number; slotsAdded: number; ok: boolean };

export async function handler(event: SeedHandlerEvent): Promise<SeedHandlerResult> {
  const count = Math.min(Math.max(1, event.count ?? 25), 200);
  const databaseUrl = await getDatabaseUrl();
  process.env.DATABASE_URL = databaseUrl;

  const prisma = new PrismaClient();
  try {
    const result = await runSeed(prisma, count);
    return { ...result, ok: true };
  } finally {
    await prisma.$disconnect();
  }
}
