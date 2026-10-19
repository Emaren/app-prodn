import type { PrismaClient, Prisma } from "@/lib/generated/prisma";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";

/**
 * The CLI and scheduled Watcher tick MUST select the same bounded, currently
 * eligible candidates. Selection is not spending authority: the funded
 * executor revalidates identity, current market, consent, vault and ticket legs.
 *
 * The source-level HOLD is enforced even for standalone callers of this
 * otherwise read-only selector. No database access occurs under HOLD.
 */
export const FUNDED_MECHA_CANDIDATE_LIMIT = 25;
export const FUNDED_MECHA_CANDIDATE_MAX_AGE_MS = 4 * 60 * 1000;

export function fundedMechaEligibleQuery(
  options: { limit?: number; now?: Date } = {},
) {
  const max = options.limit ?? FUNDED_MECHA_CANDIDATE_LIMIT;
  const now = options.now ?? new Date();
  if (!Number.isSafeInteger(max) || max < 1 || max > FUNDED_MECHA_CANDIDATE_LIMIT ||
      !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("SATCHEL_OUTBOX_TICK_INVALID_BOUND");
  }
  const earliest = new Date(now.getTime() - FUNDED_MECHA_CANDIDATE_MAX_AGE_MS);
  return {
    where: {
      ticketId: null,
      AND: [{ OR: [
        { status: "shadow_ready", reservationId: null, attemptCount: 0 },
        { status: "funded_reserved", reservationId: { not: null }, attemptCount: 1,
          satchelFundedReservation: { is: { status: "reserved",
            wagerAuthorization: { is: { approval: { isNot: null } } } } } },
      ] }],
      createdAt: { gte: earliest, lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      preset: {
        enabled: true, selfOnly: true,
        OR: [{ untilOut: true }, { gamesRemaining: { gt: 0 } }],
        user: { walletAddress: { not: null } },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: max,
    select: { id: true },
  } satisfies Prisma.BetAutoExecutionFindManyArgs;
}

/** Read only, exact same query for operator CLI and bounded scheduled tick. */
export async function readEligibleFundedMechaIds(
  prisma: PrismaClient,
  options: { limit?: number; now?: Date } = {},
): Promise<number[]> {
  requireSatchelFinancialBridge();
  const rows = await prisma.betAutoExecution.findMany(fundedMechaEligibleQuery(options));
  return rows.map(row => row.id);
}
