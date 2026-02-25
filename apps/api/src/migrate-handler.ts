/**
 * CloudFormation Custom Resource handler: runs Prisma migration SQL files
 * against Aurora (in VPC) and reports Success/Failure to CloudFormation.
 */
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import pg from "pg";
import path from "path";
import fs from "fs";
import https from "https";
import { createHash } from "crypto";

const PRISMA_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _prisma_migrations (
  id                      VARCHAR(36) PRIMARY KEY NOT NULL,
  checksum                VARCHAR(64) NOT NULL,
  finished_at             TIMESTAMPTZ,
  migration_name          VARCHAR(255) NOT NULL,
  logs                    TEXT,
  rolled_back_at          TIMESTAMPTZ,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_steps_count     INTEGER NOT NULL DEFAULT 0
);
`;

type CloudFormationEvent = {
  RequestType: "Create" | "Update" | "Delete";
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  ResourceType: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
};

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

function getMigrationsDir(): string {
  const root = process.env.LAMBDA_TASK_ROOT || process.cwd();
  const candidate = path.join(root, "apps", "api", "prisma", "migrations");
  if (fs.existsSync(candidate)) return candidate;
  // Fallback for local or alternate layout
  const fallback = path.join(__dirname, "..", "prisma", "migrations");
  if (fs.existsSync(fallback)) return fallback;
  throw new Error(`Migrations dir not found (tried ${candidate} and ${fallback})`);
}

function listMigrationDirs(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

async function ensureMigrationsTable(client: pg.Client): Promise<void> {
  await client.query(PRISMA_MIGRATIONS_TABLE);
}

async function getAppliedMigrations(client: pg.Client): Promise<Set<string>> {
  const res = await client.query<{ migration_name: string }>(
    'SELECT migration_name FROM _prisma_migrations WHERE rolled_back_at IS NULL'
  );
  return new Set(res.rows.map((r: { migration_name: string }) => r.migration_name));
}

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function runMigrations(databaseUrl: string, migrationsDir: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const dirs = listMigrationDirs(migrationsDir);
    for (const name of dirs) {
      if (applied.has(name)) continue;
      const sqlPath = path.join(migrationsDir, name, "migration.sql");
      if (!fs.existsSync(sqlPath)) {
        throw new Error(`Missing migration.sql in ${name}`);
      }
      const sql = fs.readFileSync(sqlPath, "utf-8");
      const migrationId = crypto.randomUUID();
      const checksumVal = checksum(sql);
      await client.query(
        `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES ($1, $2, $3, now(), 1)`,
        [migrationId, checksumVal, name]
      );
      try {
        await client.query(sql);
        await client.query(
          `UPDATE _prisma_migrations SET finished_at = now() WHERE id = $1`,
          [migrationId]
        );
      } catch (err) {
        await client.query(
          `UPDATE _prisma_migrations SET logs = $1 WHERE id = $2`,
          [err instanceof Error ? err.message : String(err), migrationId]
        );
        throw err;
      }
    }
  } finally {
    await client.end();
  }
}

function sendResponse(
  event: CloudFormationEvent,
  status: "SUCCESS" | "FAILED",
  reason?: string
): Promise<void> {
  const body = JSON.stringify({
    Status: status,
    Reason: reason || (status === "SUCCESS" ? "Migrations complete" : "Unknown"),
    PhysicalResourceId: event.PhysicalResourceId || "migrate",
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
  });
  const u = new URL(event.ResponseURL);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "PUT",
        headers: { "Content-Type": "", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Response ${res.statusCode}`));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function handler(event: CloudFormationEvent): Promise<void> {
  const { RequestType } = event;

  const respond = (status: "SUCCESS" | "FAILED", reason?: string) =>
    sendResponse(event, status, reason);

  if (RequestType === "Delete") {
    await respond("SUCCESS");
    return;
  }

  try {
    const databaseUrl = await getDatabaseUrl();
    const migrationsDir = getMigrationsDir();
    await runMigrations(databaseUrl, migrationsDir);
    await respond("SUCCESS");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Migration failed:", message);
    await respond("FAILED", message);
    throw err;
  }
}
