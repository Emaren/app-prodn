import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function normalizeDatabaseUrl(raw: string) {
  // API service uses asyncpg scheme; Node pg adapter expects postgresql://
  return raw.replace("postgresql+asyncpg://", "postgresql://");
}

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Prisma user routes");
  }

  const pool = new Pool({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export function getPrisma() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}
