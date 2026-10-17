/**
 * Financial safety interlock for legacy WOLO market settlements.
 *
 * Existing claim retries pay directly to a user's linked Keplr wallet. A
 * BetStakeTicket funded from the pooled War Satchel vault needs a different
 * settlement protocol: verifiable escrow→vault bank receipt, unique claim
 * ownership and atomic allocation back to the correct Satchel owner.
 *
 * Until that is implemented, do not let even an admin retry silently route
 * an auto-vault claim through the legacy direct-wallet payout service.
 */
import type { PrismaClient } from "@/lib/generated/prisma";

export async function assertNoUnroutedSatchelSettlementClaim(
  prisma: PrismaClient,
  input: Readonly<{
    claimId: number;
    claimKind: string | null;
    marketId: number | null;
    ownerUserId: number;
  }>,
): Promise<void> {
  if (input.claimKind !== "bet_payout" && input.claimKind !== "bet_refund") return;
  if (input.marketId === null) return;
  if (!Number.isSafeInteger(input.claimId) || input.claimId <= 0 ||
      !Number.isSafeInteger(input.marketId) || input.marketId <= 0 ||
      !Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0) {
    throw Error("SATCHEL_SETTLEMENT_GUARD_INVALID_IDENTITY");
  }
  const wagers = await prisma.betWager.findMany({
    where: {
      // Never infer custody from legacy status strings: a wager may be
      // "active", "void", "lost", or midway through settlement. If ANY
      // escrow-funded Satchel ticket exists for this owner+market, stop the
      // legacy direct-wallet payout path until exact return routing exists.
      marketId: input.marketId, userId: input.ownerUserId,
    },
    select: {
      id: true,
      stakeLeg: {
        select: {
          ticket: {
            select: {
              source: true,
              walletProvider: true,
              walletAddress: true,
            },
          },
        },
      },
    },
    take: 1001,
  });
  if (wagers.length > 1000) {
    throw Error("SATCHEL_SETTLEMENT_GUARD_OWNER_CENSUS_OVERFLOW");
  }
  if (wagers.some(w =>
    w.stakeLeg?.ticket?.source === "auto" &&
    w.stakeLeg.ticket.walletProvider === "satchel-vault"
  )) {
    throw Error(
      "SATCHEL_SETTLEMENT_RETURN_NOT_CERTIFIED:" +
      " pooled-custody claim requires owner-ledger credit and chain proof " +
      "claim=" + input.claimId,
    );
  }
}
