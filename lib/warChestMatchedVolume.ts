/**
 * Matched-only War Chest volume, never gross unmatched stake.
 *
 * Prisma groupBy supplies per-market/side sums. Accumulate in exact integer
 * space: each separate market can fit in a safe JS number while weekly/all-time
 * aggregation silently crosses 2^53. This is read-only display arithmetic,
 * NOT proof that a ticket was funded or settled on WoloChain.
 */
import { matchedMarketVolumeWolo } from "./betWagerSettlement.ts";

export type WarChestSideTotal = Readonly<{
  marketId: number;
  side: string;
  _sum: { amountWolo: number | null };
}>;

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function safeWolo(value: bigint): number {
  if (value < BigInt(0) || value > MAX_SAFE) {
    throw Error("WAR_CHEST_MATCHED_VOLUME_UNSAFE_TOTAL");
  }
  return Number(value);
}

export function matchedVolumeFromSideTotals(
  rows: readonly WarChestSideTotal[],
): number {
  const byMarket = new Map<number, {left: bigint; right: bigint}>();
  for (const row of rows) {
    const amount = row._sum.amountWolo ?? 0;
    if (!Number.isSafeInteger(row.marketId) || row.marketId <= 0 ||
        (row.side !== "left" && row.side !== "right") ||
        !Number.isSafeInteger(amount) || amount < 0) {
      throw Error("WAR_CHEST_MATCHED_VOLUME_INVALID_GROUP");
    }
    const pool = byMarket.get(row.marketId) ??
      {left: BigInt(0), right: BigInt(0)};
    pool[row.side] += BigInt(amount);
    byMarket.set(row.marketId, pool);
  }
  let matched = BigInt(0);
  for (const pool of byMarket.values()) {
    // Reuse the same side-matching authority as the canonical ticket planner.
    matched += BigInt(matchedMarketVolumeWolo(
      safeWolo(pool.left), safeWolo(pool.right),
    ));
  }
  return safeWolo(matched);
}
