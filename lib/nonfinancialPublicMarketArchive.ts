/**
 * Historical market labels from the existing v9 security-barrier PUBLIC view.
 *
 * This is NOT settlement finality, wallet evidence, an open betting market,
 * a wager ledger or permission for any on-chain transfer.
 * Missing view/permissions must fail closed; no private-table fallback.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

type Row = {
  id: number;
  title: string;
  eventLabel: string;
  status: string;
  leftLabel: string;
  rightLabel: string;
};

export type PublicHistoricalMarket = Readonly<{
  id: number;
  title: string;
  eventLabel: string;
  recordedStatus: "settled" | "voided" | "under_review";
  leftLabel: string;
  rightLabel: string;
}>;

const statuses = new Set(["settled", "voided", "under_review"]);

function label(input: unknown, limit: number): string {
  if (typeof input !== "string") throw Error("A05_PUBLIC_MARKET_INVALID_LABEL");
  const value = input.trim().slice(0, limit);
  if (!value) throw Error("A05_PUBLIC_MARKET_EMPTY_LABEL");
  return value;
}

export async function loadNonfinancialPublicMarketArchive(
  prisma: PrismaClient,
): Promise<PublicHistoricalMarket[]> {
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT id, title, "eventLabel", status, "leftLabel", "rightLabel"
    FROM aoe2war_public_v9.published_markets
    WHERE "publicIntegrityEligible" IS TRUE
      AND status IN ('settled', 'voided', 'under_review')
    ORDER BY id DESC
    LIMIT 18
  `);
  return rows.map((row) => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0 || !statuses.has(row.status))
      throw Error("A05_PUBLIC_MARKET_INVALID_ROW");
    return {
      id: row.id,
      title: label(row.title, 160),
      eventLabel: label(row.eventLabel, 120),
      recordedStatus: row.status as PublicHistoricalMarket["recordedStatus"],
      leftLabel: label(row.leftLabel, 80),
      rightLabel: label(row.rightLabel, 80),
    };
  });
}
