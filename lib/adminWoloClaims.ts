import type { PrismaClient } from "@/lib/generated/prisma";

import {
  resolveFounderClaimTargetUser,
  syncFounderBonusStatus,
} from "@/lib/betFounderBonuses";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { recordUserActivity } from "@/lib/userExperience";
import { validateDistinctClaimPayoutTx } from "@/lib/woloClaimPayoutGuards";
import {
  executeFounderWoloPayout,
  executeWoloPayout,
  executeWoloSettlementRun,
  getWoloPayoutExecutionBlocker,
  type SettlementRunResult,
} from "@/lib/woloBetSettlement";

type ClaimIdentity = {
  displayPlayerName: string;
  normalizedPlayerName: string;
};

type MatchedClaimUser = {
  id: number;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress: string | null;
};

type RetryClaimSettlementOptions = {
  activityPath?: string;
  memoTag?: string;
};

const MAINNET_CLAIM_CUTOFF = new Date("2026-05-25T00:00:00.000Z");

export type RetryClaimSettlementResult =
  | {
      outcome: "claimed";
      claimId: number;
      amountWolo: number;
      txHash: string;
      matchedUserId: number;
    }
  | {
      outcome: "skipped";
      claimId: number;
      reason: "not_found" | "not_pending" | "unmatched_user" | "already_has_payout_tx" | "pre_mainnet_legacy";
      detail?: string;
    }
  | {
      outcome: "failed";
      claimId: number;
      detail: string;
    };

function normalizeClaimKey(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase();
}

function isAwaitingVerifiedWalletLinkDetail(value: string | null | undefined) {
  return /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
    value || ""
  );
}

function compactSettlementNote(label: string, amountWolo: number, txHash: string) {
  return `Auto-settled on-chain · ${label} · ${amountWolo} WOLO · tx ${txHash}`.slice(0, 160);
}

function compactDbDetail(value: string | null | undefined) {
  const normalized = (value || "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 255) : null;
}

const MARKET_SETTLEMENT_CLAIM_KINDS = new Set(["bet_payout", "bet_refund", "winner_bounty", "founders_bonus"]);

function isMarketSettlementClaim(claim: {
  sourceMarketId: number | null;
  claimKind: string | null;
}) {
  return Boolean(
    typeof claim.sourceMarketId === "number" &&
      MARKET_SETTLEMENT_CLAIM_KINDS.has((claim.claimKind || "").trim())
  );
}

function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_003;
  }
  return Math.abs(hash);
}

function buildAdminMarketClaimSettlementRunId(sourceMarketId: number, claimId: number) {
  return `aoe2-market-claim-${sourceMarketId}-${claimId}`;
}

function buildAdminMarketClaimRequestId(input: {
  claimId: number;
  claimKind: string;
  matchedUserId: number;
}) {
  const claimKind = input.claimKind.trim() || "market_claim";
  const fingerprint = hashValue(`${input.matchedUserId}:${input.claimId}:${claimKind}`);
  return `aoe2-claim-${input.claimId}-${claimKind}-${fingerprint}`;
}

function summarizeSettlementRunFailure(
  run: SettlementRunResult,
  payout?: SettlementRunResult["payouts"][number] | null
) {
  return (
    payout?.detail ||
    payout?.failureCode ||
    run.detail ||
    run.failureCode ||
    "WOLO grouped market claim retry failed."
  );
}

async function executeMarketClaimSettlementRun(input: {
  claimId: number;
  sourceMarketId: number;
  claimKind: string;
  amountWolo: number;
  toAddress: string;
  matchedUserId: number;
  marketTitle: string;
  memoTag: string;
}) {
  const settlementRunId = buildAdminMarketClaimSettlementRunId(
    input.sourceMarketId,
    input.claimId
  );
  const requestId = buildAdminMarketClaimRequestId({
    claimId: input.claimId,
    claimKind: input.claimKind,
    matchedUserId: input.matchedUserId,
  });

  const execution = await executeWoloSettlementRun({
    settlementRunId,
    sourceApp: "aoe2hdbets",
    sourceEventId: `pending-claim-${input.claimId}`,
    note: `Admin claim retry · ${input.marketTitle}`,
    memo: `AoE2 admin claim retry · claim ${input.claimId}`,
    payouts: [
      {
        requestId,
        toAddress: input.toAddress,
        amountWolo: input.amountWolo,
        memo: `${input.marketTitle} · ${input.claimKind} · ${input.memoTag}`,
      },
    ],
  });

  const payout =
    execution.payouts.find((candidate) => candidate.requestId === requestId) ||
    execution.payouts[0] ||
    null;

  if (!execution.ok || !payout?.ok || !payout.txHash) {
    throw new Error(summarizeSettlementRunFailure(execution, payout));
  }

  return {
    settlementRunId: execution.settlementRunId || settlementRunId,
    status: execution.status,
    txHash: payout.txHash,
    proofUrl: payout.proofUrl ?? null,
    detail: execution.detail ?? payout.detail ?? null,
  };
}

export async function findMatchedClaimUser(
  prisma: PrismaClient,
  claim: ClaimIdentity
): Promise<MatchedClaimUser | null> {
  const claimKeys = Array.from(
    new Set(
      [claim.displayPlayerName, claim.normalizedPlayerName]
        .map((value) => normalizeClaimKey(value))
        .filter(Boolean)
    )
  );

  if (claimKeys.length === 0) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: {
      walletAddress: { not: null },
      AND: [
        { OR: [{ verified: true }, { verificationLevel: { gt: 0 } }, { steamId: { not: null } }] },
        { OR: [{ inGameName: { not: null } }, { steamPersonaName: { not: null } }] },
      ],
    },
    select: {
      id: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
    },
    take: 250,
  });

  return (
    users.find((user) => {
      const userKeys = [user.inGameName, user.steamPersonaName]
        .map((value) => normalizeClaimKey(value))
        .filter(Boolean);
      return userKeys.some((key) => claimKeys.includes(key));
    }) || null
  );
}

export async function retryPendingClaimSettlement(
  prisma: PrismaClient,
  claimId: number,
  options?: RetryClaimSettlementOptions
): Promise<RetryClaimSettlementResult> {
  const claim = await prisma.pendingWoloClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      displayPlayerName: true,
      normalizedPlayerName: true,
      amountWolo: true,
      claimKind: true,
      claimGroupKey: true,
      targetScope: true,
      status: true,
      errorState: true,
      payoutAttemptedAt: true,
      sourceMarketId: true,
      sourceFounderBonusId: true,
      payoutTxHash: true,
      createdAt: true,
    },
  });

  if (!claim) {
    return { outcome: "skipped", claimId, reason: "not_found" };
  }

  if (claim.status !== "pending") {
    return { outcome: "skipped", claimId: claim.id, reason: "not_pending" };
  }

  if (claim.payoutTxHash?.trim()) {
    return { outcome: "skipped", claimId: claim.id, reason: "already_has_payout_tx" };
  }

  if (claim.createdAt < MAINNET_CLAIM_CUTOFF) {
    const detail = "Legacy pre-mainnet claim row is not payable on WoloChain mainnet.";

    await prisma.pendingWoloClaim.update({
      where: { id: claim.id },
      data: {
        status: "rescinded",
        errorState: "Closed 20260610: legacy pre-mainnet pending row; not payable on mainnet.",
        payoutAttemptedAt: null,
        rescindedAt: new Date(),
      },
    });

    return {
      outcome: "skipped",
      claimId: claim.id,
      reason: "pre_mainnet_legacy",
      detail,
    };
  }

  const founderResolution = claim.sourceFounderBonusId
    ? await resolveFounderClaimTargetUser(prisma, {
        sourceFounderBonusId: claim.sourceFounderBonusId,
        displayPlayerName: claim.displayPlayerName,
        claimGroupKey: claim.claimGroupKey,
        targetScope: claim.targetScope,
      })
    : null;
  const matchedUser =
    founderResolution?.matchedUser ?? (await findMatchedClaimUser(prisma, claim));
  if (!matchedUser?.walletAddress) {
    const detail =
      founderResolution?.detail ||
      "Awaiting verified wallet-linked account for this player. This payout stays pending until the player links a verified wallet.";

    if (isAwaitingVerifiedWalletLinkDetail(detail)) {
      await prisma.pendingWoloClaim.update({
        where: { id: claim.id },
        data: {
          errorState: detail.trim().replace(/\s+/g, " ").slice(0, 255),
          payoutAttemptedAt: null,
        },
      });
    }

    if (claim.sourceFounderBonusId && isAwaitingVerifiedWalletLinkDetail(detail)) {
      await syncFounderBonusStatus(prisma, [claim.sourceFounderBonusId]);
    }

    return {
      outcome: "skipped",
      claimId: claim.id,
      reason: "unmatched_user",
      detail,
    };
  }

  const market =
    typeof claim.sourceMarketId === "number"
      ? await prisma.betMarket.findUnique({
          where: { id: claim.sourceMarketId },
          select: {
            id: true,
            title: true,
            eventLabel: true,
          },
        })
      : null;

  const attemptAt = new Date();
  const memoTag = options?.memoTag?.trim() || "admin_retry_settlement";
  const activityPath = options?.activityPath?.trim() || "/admin/user-list";

  const useFounderSettlement = Boolean(claim.sourceFounderBonusId);
  const useGroupedMarketSettlement = Boolean(!useFounderSettlement && market && isMarketSettlementClaim(claim));
  let settlementRunId: string | null = null;

  try {
    const payout = useGroupedMarketSettlement && market
      ? await executeMarketClaimSettlementRun({
          claimId: claim.id,
          sourceMarketId: market.id,
          claimKind: claim.claimKind,
          amountWolo: claim.amountWolo,
          toAddress: matchedUser.walletAddress,
          matchedUserId: matchedUser.id,
          marketTitle: market.title,
          memoTag,
        })
      : await (useFounderSettlement ? executeFounderWoloPayout : executeWoloPayout)({
          toAddress: matchedUser.walletAddress,
          amountWolo: claim.amountWolo,
          memo: `${market?.title || claim.displayPlayerName} · ${memoTag}`,
        });

    if (!payout?.txHash) {
      throw new Error(
        getWoloPayoutExecutionBlocker() ||
          "WOLO payout execution returned no transaction hash."
      );
    }

    settlementRunId = "settlementRunId" in payout ? payout.settlementRunId : null;

    const payoutGuard = await validateDistinctClaimPayoutTx(prisma, {
      key: `claim-${claim.id}`,
      claimId: claim.id,
      txHash: payout.txHash,
      toAddress: matchedUser.walletAddress,
      amountWolo: claim.amountWolo,
    });

    if (!payoutGuard.ok) {
      throw new Error(
        payoutGuard.detail ||
          payoutGuard.failureCode ||
          "WOLO payout tx failed distinct MsgSend validation."
      );
    }

    await prisma.pendingWoloClaim.update({
      where: { id: claim.id },
      data: {
        status: "claimed",
        claimedByUserId: matchedUser.id,
        claimedAt: attemptAt,
        payoutTxHash: payout.txHash,
        payoutProofUrl: payoutGuard.proofUrl ?? payout.proofUrl ?? null,
        errorState: null,
        payoutAttemptedAt: attemptAt,
        note: compactSettlementNote(
          market?.title || claim.displayPlayerName,
          claim.amountWolo,
          payout.txHash
        ),
      },
    });

    if (useGroupedMarketSettlement && market && claim.claimKind !== "founders_bonus") {
      await prisma.betMarket.update({
        where: { id: market.id },
        data: {
          settlementRunId,
          settlementStatus: "executed",
          settlementFailureCode: null,
          settlementDetail: compactDbDetail(
            `Admin retry settled claim ${claim.id} on grouped market rail · tx ${payout.txHash}`
          ),
          settlementAttemptedAt: attemptAt,
          settlementExecutedAt: attemptAt,
        },
      });

      if (claim.claimKind === "bet_payout" || claim.claimKind === "bet_refund") {
        await prisma.betWager.updateMany({
          where: {
            marketId: market.id,
            userId: matchedUser.id,
            status: claim.claimKind === "bet_refund" ? "void" : "won",
          },
          data: {
            payoutTxHash: payout.txHash,
            payoutProofUrl: payoutGuard.proofUrl ?? payout.proofUrl ?? null,
          },
        });
      }
    }

    if (claim.sourceFounderBonusId) {
      await syncFounderBonusStatus(prisma, [claim.sourceFounderBonusId]);
    }

    await recordUserActivity(prisma, {
      userId: matchedUser.id,
      type: "wolo_claim_auto_settled",
      path: activityPath,
      label: claim.displayPlayerName,
      metadata: {
        claimId: claim.id,
        amountWolo: claim.amountWolo,
        payoutTxHash: payout.txHash,
        sourceMarketId: claim.sourceMarketId,
      },
      dedupeWithinSeconds: 0,
    });

    return {
      outcome: "claimed",
      claimId: claim.id,
      amountWolo: claim.amountWolo,
      txHash: payout.txHash,
      matchedUserId: matchedUser.id,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "WOLO payout retry failed.";

    await prisma.pendingWoloClaim.update({
      where: { id: claim.id },
      data: {
        errorState: detail.trim().replace(/\s+/g, " ").slice(0, 255),
        payoutAttemptedAt: attemptAt,
      },
    });

    if (useGroupedMarketSettlement && market && claim.claimKind !== "founders_bonus") {
      await prisma.betMarket.update({
        where: { id: market.id },
        data: {
          settlementStatus: "failed",
          settlementFailureCode: "ADMIN_RETRY_FAILED",
          settlementDetail: compactDbDetail(detail),
          settlementAttemptedAt: attemptAt,
        },
      });
    }

    if (claim.sourceFounderBonusId) {
      await syncFounderBonusStatus(prisma, [claim.sourceFounderBonusId]);
    }

    return {
      outcome: "failed",
      claimId: claim.id,
      detail,
    };
  }
}
