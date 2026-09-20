import "dotenv/config";

import type { PrismaClient } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import {
  planResolvedWagerSettlements,
  type ResolvedWagerSide,
} from "@/lib/betWagerSettlement";
import {
  createPendingWoloClaim,
  normalizePendingWoloClaimName,
} from "@/lib/pendingWoloClaims";
import { recordUserActivity } from "@/lib/userExperience";
import {
  executeWoloEscrowSettlementRun,
  findConfirmedWoloPayoutByMemo,
  validateWoloAddress,
  validateWoloEscrowSettlementRun,
} from "@/lib/woloBetSettlement";
import { validateDistinctClaimPayoutTxBatch } from "@/lib/woloClaimPayoutGuards";
import {
  buildWoloRestTxLookupUrl,
  getWoloBetEscrowRuntime,
} from "@/lib/woloChain";
import {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
} from "@/lib/bettingFees";

const EFFECTIVE_AT = new Date("2026-09-17T02:38:00.000Z");
const EXPECTED_INITIAL_TOTAL_WOLO = 152_102;
const EXPECTED_INITIAL_ROW_COUNT = 7;
const CLAIM_KIND = "bet_unmatched_refund";
const SETTLEMENT_RUN_ID = "aoe2-jims-rule-20260917";
const SOURCE_EVENT_ID = "jims-rule-20260917";
const CONFIRMATION = "JIMS-RULE-20260917-152102";

type CorrectionRow = {
  marketId: number;
  marketTitle: string;
  sourceGameStatsId: number | null;
  wagerId: number;
  userId: number;
  bettor: string;
  walletAddress: string;
  side: ResolvedWagerSide;
  originalStakeWolo: number;
  matchedWolo: number;
  unmatchedWolo: number;
  currentStatus: string;
  actualPayoutWolo: number;
  correctPayoutWolo: number;
  owedWolo: number;
  claimGroupKey: string;
  requestId: string;
  memo: string;
  existingClaim: {
    id: number;
    status: string;
    amountWolo: number;
    payoutTxHash: string | null;
  } | null;
};

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid;
}

async function loadCorrectionPlan() {
  const prisma = getPrisma();
  const markets = await prisma.betMarket.findMany({
    where: {
      status: { in: ["settled", "voided"] },
      wagers: { some: { createdAt: { gte: EFFECTIVE_AT } } },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      title: true,
      status: true,
      winnerSide: true,
      marketType: true,
      seedLeftWolo: true,
      seedRightWolo: true,
      linkedGameStatsId: true,
      wagers: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          userId: true,
          side: true,
          amountWolo: true,
          payoutWolo: true,
          status: true,
          executionMode: true,
          createdAt: true,
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
              walletAddress: true,
              verified: true,
              verificationLevel: true,
              steamId: true,
            },
          },
        },
      },
    },
  });

  const rows: CorrectionRow[] = [];
  const overpayments: Array<{
    marketId: number;
    wagerId: number;
    bettor: string;
    actualPayoutWolo: number;
    correctPayoutWolo: number;
  }> = [];

  for (const market of markets) {
    const winningSide: ResolvedWagerSide | null =
      market.status === "settled" &&
      (market.winnerSide === "left" || market.winnerSide === "right")
        ? market.winnerSide
        : null;

    if (market.status === "settled" && !winningSide) {
      throw new Error(
        `STOP: settled market #${market.id} has no valid winning side.`
      );
    }

    const plan = planResolvedWagerSettlements({
      winningSide,
      marketType: market.marketType,
      desyncMarketType: "__jims_rule_no_special_market__",
      seedLeftWolo: market.seedLeftWolo,
      seedRightWolo: market.seedRightWolo,
      wagers: market.wagers.map((wager) => ({
        id: wager.id,
        side: wager.side,
        amountWolo: wager.amountWolo,
      })),
      feeRateBps: BETTING_FEE_RATE_BPS,
      feeDenominator: BPS_DENOMINATOR,
    });
    const outcomeById = new Map(plan.outcomes.map((outcome) => [outcome.id, outcome]));
    const exposureById = new Map(plan.exposures.map((exposure) => [exposure.id, exposure]));

    for (const wager of market.wagers) {
      if (wager.createdAt < EFFECTIVE_AT) continue;

      const outcome = outcomeById.get(wager.id);
      const exposure = exposureById.get(wager.id);
      if (!outcome || !exposure) {
        throw new Error(`STOP: planner omitted wager #${wager.id}.`);
      }

      const actualPayoutWolo = wager.payoutWolo ?? 0;
      if (actualPayoutWolo > outcome.payoutWolo) {
        overpayments.push({
          marketId: market.id,
          wagerId: wager.id,
          bettor: displayName(wager.user),
          actualPayoutWolo,
          correctPayoutWolo: outcome.payoutWolo,
        });
        continue;
      }

      const owedWolo = outcome.payoutWolo - actualPayoutWolo;
      if (owedWolo < 1) continue;

      if (wager.executionMode !== "onchain_escrow") {
        throw new Error(
          `STOP: wager #${wager.id} owes ${owedWolo} WOLO but executionMode=${wager.executionMode}.`
        );
      }
      const walletAddress = wager.user.walletAddress?.trim() || "";
      const addressError = validateWoloAddress(walletAddress);
      if (!walletAddress || addressError) {
        throw new Error(
          `STOP: wager #${wager.id} bettor ${displayName(wager.user)} has no valid WOLO wallet.`
        );
      }
      if (!wager.user.verified || !wager.user.steamId) {
        throw new Error(
          `STOP: wager #${wager.id} bettor ${displayName(wager.user)} is not a verified Steam-linked user.`
        );
      }

      const bettor = displayName(wager.user);
      const claimGroupKey = `jims-rule:wager:${wager.id}`;
      const normalizedPlayerName = normalizePendingWoloClaimName(bettor);
      const existingClaim = await prisma.pendingWoloClaim.findUnique({
        where: {
          sourceMarketId_normalizedPlayerName_claimKind_claimGroupKey: {
            sourceMarketId: market.id,
            normalizedPlayerName,
            claimKind: CLAIM_KIND,
            claimGroupKey,
          },
        },
        select: {
          id: true,
          status: true,
          amountWolo: true,
          payoutTxHash: true,
        },
      });

      if (
        existingClaim &&
        (existingClaim.amountWolo !== owedWolo ||
          (existingClaim.status === "claimed" && !existingClaim.payoutTxHash))
      ) {
        throw new Error(
          `STOP: existing #JimsRule claim for wager #${wager.id} is inconsistent with fresh entitlement.`
        );
      }

      rows.push({
        marketId: market.id,
        marketTitle: market.title,
        sourceGameStatsId: market.linkedGameStatsId,
        wagerId: wager.id,
        userId: wager.userId,
        bettor,
        walletAddress,
        side: wager.side as ResolvedWagerSide,
        originalStakeWolo: wager.amountWolo,
        matchedWolo: exposure.matchedWolo,
        unmatchedWolo: exposure.unmatchedWolo,
        currentStatus: wager.status,
        actualPayoutWolo,
        correctPayoutWolo: outcome.payoutWolo,
        owedWolo,
        claimGroupKey,
        requestId: `jims-rule-wager-${wager.id}`,
        memo: `AoE2 #JimsRule unmatched refund · wager ${wager.id}`,
        existingClaim,
      });
    }
  }

  if (overpayments.length > 0) {
    throw new Error(
      `STOP: fresh #JimsRule planner found overpayments; operator review required: ${JSON.stringify(overpayments)}`
    );
  }

  return rows;
}

function summarize(rows: CorrectionRow[]) {
  const byBettor = new Map<string, number>();
  for (const row of rows) {
    byBettor.set(row.bettor, (byBettor.get(row.bettor) ?? 0) + row.owedWolo);
  }
  return {
    effectiveAt: EFFECTIVE_AT.toISOString(),
    rowCount: rows.length,
    totalWolo: rows.reduce((sum, row) => sum + row.owedWolo, 0),
    byBettor: Object.fromEntries([...byBettor.entries()].sort(([a], [b]) => a.localeCompare(b))),
    rows: rows.map((row) => ({
      marketId: row.marketId,
      wagerId: row.wagerId,
      bettor: row.bettor,
      side: row.side,
      stakeWolo: row.originalStakeWolo,
      matchedWolo: row.matchedWolo,
      unmatchedWolo: row.unmatchedWolo,
      status: row.currentStatus,
      actualPayoutWolo: row.actualPayoutWolo,
      correctPayoutWolo: row.correctPayoutWolo,
      owedWolo: row.owedWolo,
      existingClaim: row.existingClaim,
    })),
  };
}

async function validateOutstanding(rows: CorrectionRow[]) {
  const outstanding = rows.filter(
    (row) => row.existingClaim?.status !== "claimed"
  );
  if (outstanding.length === 0) {
    return { outstanding, validation: null };
  }

  const validation = await validateWoloEscrowSettlementRun({
    settlementRunId: SETTLEMENT_RUN_ID,
    sourceApp: "aoe2hdbets",
    sourceEventId: SOURCE_EVENT_ID,
    note: "#JimsRule unmatched-principal / unmatched-fee correction",
    memo: "#JimsRule unmatched-principal correction",
    payouts: outstanding.map((row) => ({
      requestId: row.requestId,
      toAddress: row.walletAddress,
      amountWolo: row.owedWolo,
      memo: row.memo,
    })),
  });

  return { outstanding, validation };
}

async function finalizeRow(
  row: CorrectionRow,
  payout: { txHash: string; proofUrl: string | null; recovered: boolean }
) {
  const prisma = getPrisma();
  const guard = (
    await validateDistinctClaimPayoutTxBatch(prisma, [{
      key: row.requestId,
      txHash: payout.txHash,
      toAddress: row.walletAddress,
      amountWolo: row.owedWolo,
    }])
  ).get(row.requestId);

  if (!guard?.ok) {
    throw new Error(
      `STOP: distinct payout guard rejected wager #${row.wagerId} tx ${payout.txHash}.`
    );
  }

  await prisma.$transaction(async (tx) => {
    const claim = await createPendingWoloClaim(tx as PrismaClient, {
      playerName: row.bettor,
      displayPlayerName: row.bettor,
      amountWolo: row.owedWolo,
      claimKind: CLAIM_KIND,
      claimGroupKey: row.claimGroupKey,
      targetScope: "unmatched_refund",
      sourceMarketId: row.marketId,
      sourceGameStatsId: row.sourceGameStatsId,
      payoutTxHash: payout.txHash,
      payoutProofUrl: guard.proofUrl ?? payout.proofUrl,
      payoutAttemptedAt: new Date(),
      note: `#JimsRule unmatched principal/fee correction · wager ${row.wagerId}`,
      status: "claimed",
      claimedByUserId: row.userId,
      claimedAt: new Date(),
    });

    await tx.betWager.update({
      where: { id: row.wagerId },
      data: {
        payoutWolo: row.correctPayoutWolo,
        ...(row.actualPayoutWolo === 0
          ? {
              payoutTxHash: payout.txHash,
              payoutProofUrl: guard.proofUrl ?? payout.proofUrl,
            }
          : {}),
      },
    });

    await recordUserActivity(tx, {
      userId: row.userId,
      type: "bet_unmatched_refund_completed",
      path: `/bets/${row.marketId}`,
      label: row.marketTitle,
      metadata: {
        policy: "#JimsRule",
        effectiveAt: EFFECTIVE_AT.toISOString(),
        marketId: row.marketId,
        wagerId: row.wagerId,
        originalStakeWolo: row.originalStakeWolo,
        matchedWolo: row.matchedWolo,
        unmatchedWolo: row.unmatchedWolo,
        amountWolo: row.owedWolo,
        correctPayoutWolo: row.correctPayoutWolo,
        claimId: claim?.id ?? null,
        txHash: payout.txHash,
        recoveredFromChain: payout.recovered,
      },
      dedupeWithinSeconds: 86_400,
    });
  });
}

const execute = process.argv.includes("--execute");
const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="));
const confirm = confirmArg?.slice("--confirm=".length) || "";
const prisma = getPrisma();

try {
  const before = await loadCorrectionPlan();
  const summary = summarize(before);
  console.log("\n== #JIMSRULE CORRECTION PLAN ==");
  console.log(JSON.stringify(summary, null, 2));

  if (
    before.every((row) => !row.existingClaim) &&
    (summary.rowCount !== EXPECTED_INITIAL_ROW_COUNT ||
      summary.totalWolo !== EXPECTED_INITIAL_TOTAL_WOLO)
  ) {
    throw new Error(
      `STOP: initial correction census drifted from independently verified baseline ${EXPECTED_INITIAL_ROW_COUNT} rows / ${EXPECTED_INITIAL_TOTAL_WOLO} WOLO.`
    );
  }

  const { outstanding, validation } = await validateOutstanding(before);

  if (outstanding.length === 0) {
    console.log("\nPASS: no outstanding #JimsRule corrections remain.");
    process.exitCode = 0;
  } else {
    console.log("\n== ESCROW DRY-RUN ==");
    console.log(JSON.stringify({
      outstandingCount: outstanding.length,
      outstandingWolo: outstanding.reduce((sum, row) => sum + row.owedWolo, 0),
      ok: validation?.ok ?? false,
      status: validation?.status ?? null,
      failureCode: validation?.failureCode ?? null,
      detail: validation?.detail ?? null,
      payouts: validation?.payouts ?? [],
    }, null, 2));

    if (!validation?.ok) {
      throw new Error(
        `STOP: #JimsRule escrow dry-run is not green: ${validation?.detail || validation?.failureCode || "unknown"}`
      );
    }

    if (!execute) {
      console.log("\nPASS: #JimsRule correction plan and escrow dry-run are green.");
      console.log(
        `Execute exactly once with: npm run bets:jims-rule-backfill -- --execute --confirm=${CONFIRMATION}`
      );
    } else {
      if (confirm !== CONFIRMATION) {
        throw new Error(
          `STOP: execution requires --confirm=${CONFIRMATION}. No funds moved.`
        );
      }

      const escrowAddress = getWoloBetEscrowRuntime().escrowAddress;
      if (!escrowAddress) {
        throw new Error("STOP: canonical Wolo bet escrow address is unavailable.");
      }

      const recovered = new Map<string, { txHash: string; proofUrl: string | null; recovered: boolean }>();
      const stillNeedsBroadcast: CorrectionRow[] = [];

      for (const row of outstanding) {
        const existing = await findConfirmedWoloPayoutByMemo({
          fromAddress: escrowAddress,
          toAddress: row.walletAddress,
          amountWolo: row.owedWolo,
          memo: row.memo,
        });
        if (existing) {
          recovered.set(row.requestId, {
            txHash: existing.txHash,
            proofUrl: existing.proofUrl ?? buildWoloRestTxLookupUrl(existing.txHash),
            recovered: true,
          });
        } else {
          stillNeedsBroadcast.push(row);
        }
      }

      if (stillNeedsBroadcast.length > 0) {
        const execution = await executeWoloEscrowSettlementRun({
          settlementRunId: SETTLEMENT_RUN_ID,
          sourceApp: "aoe2hdbets",
          sourceEventId: SOURCE_EVENT_ID,
          note: "#JimsRule unmatched-principal / unmatched-fee correction",
          memo: "#JimsRule unmatched-principal correction",
          payouts: stillNeedsBroadcast.map((row) => ({
            requestId: row.requestId,
            toAddress: row.walletAddress,
            amountWolo: row.owedWolo,
            memo: row.memo,
          })),
        });

        if (!execution.ok) {
          throw new Error(
            `STOP: #JimsRule execution failed: ${execution.detail || execution.failureCode || "unknown"}`
          );
        }

        for (const row of stillNeedsBroadcast) {
          const result = execution.payouts.find(
            (entry) => entry.requestId === row.requestId
          );
          if (!result?.ok || !result.txHash) {
            throw new Error(
              `STOP: payout result missing for wager #${row.wagerId}.`
            );
          }
          recovered.set(row.requestId, {
            txHash: result.txHash,
            proofUrl:
              result.proofUrl ||
              result.canonicalTxLookupPublic ||
              buildWoloRestTxLookupUrl(result.txHash),
            recovered: Boolean(result.idempotentReplay),
          });
        }
      }

      for (const row of outstanding) {
        const payout = recovered.get(row.requestId);
        if (!payout) {
          throw new Error(
            `STOP: no chain payout proof resolved for wager #${row.wagerId}.`
          );
        }
        await finalizeRow(row, payout);
      }

      const after = await loadCorrectionPlan();
      console.log("\n== #JIMSRULE POST-FLIGHT ==");
      console.log(JSON.stringify(summarize(after), null, 2));
      if (after.length !== 0) {
        throw new Error(
          `STOP: post-flight still reports ${after.length} underpaid wager(s).`
        );
      }
      console.log(
        `\nPASS: #JimsRule backfill completed. Initial audited entitlement: ${EXPECTED_INITIAL_TOTAL_WOLO.toLocaleString()} WOLO across ${EXPECTED_INITIAL_ROW_COUNT} wagers.`
      );
    }
  }
} finally {
  await prisma.$disconnect();
}
