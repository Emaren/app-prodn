import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/index.js";
import { backfillWoloMainnetTransfers } from "../lib/woloMainnetTransfers.ts";

function normalizeDatabaseUrl(raw) {
  return raw.replace("postgresql+asyncpg://", "postgresql://");
}

function readNumberArg(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const pool = new Pool({ connectionString: normalizeDatabaseUrl(databaseUrl) });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await backfillWoloMainnetTransfers(prisma, {
      blockLimit: readNumberArg("block-limit"),
      addressLimit: readNumberArg("address-limit"),
      perAddressLimit: readNumberArg("per-address-limit"),
      globalLimit: readNumberArg("global-limit"),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
