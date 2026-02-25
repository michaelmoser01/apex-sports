import path from "path";
import type { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  // In Lambda, load the generated client directly so the "@prisma/client did not initialize yet"
  // error is avoided (bundler/deploy layout can break the wrapper's init order).
  if (process.env.LAMBDA_TASK_ROOT) {
    const generatedPath = path.join(process.env.LAMBDA_TASK_ROOT, "node_modules", ".prisma", "client");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: GeneratedClient } = require(generatedPath) as { PrismaClient: new (opts?: object) => PrismaClient };
    return new GeneratedClient({
      log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: WrapperClient } = require("@prisma/client");
  return new WrapperClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
