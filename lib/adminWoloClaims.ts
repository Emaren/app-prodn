import type { PrismaClient } from "@/lib/generated/prisma";

import {
  resolveFounderClaimTargetUser,
  syncFounderBonusStatus,
} from "@/lib/betFounderBonuses";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { recordUserActivity } from "@/lib/userExperience";
import { executeWoloPayout } from "@/lib/woloBetSettlement";

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
      reason: "not_found" | "not_pending" | "unmatched_user" | "already_has_payout_tx";
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
            title: true,
          },
        })
      : null;

  const attemptAt = new Date();
  const memoTag = options?.memoTag?.trim() || "admin_retry_settlement";
  const activityPath = options?.activityPath?.trim() || "/admin/user-list";

  try {
    const payout = await executeWoloPayout({
      toAddress: matchedUser.walletAddress,
      amountWolo: claim.amountWolo,
      memo: `${market?.title || claim.displayPlayerName} · ${memoTag}`,
    });

    if (!payout?.txHash) {
      throw new Error("WOLO payout execution returned no transaction hash.");
    }

    await prisma.pendingWoloClaim.update({
      where: { id: claim.id },
      data: {
        status: "claimed",
        claimedByUserId: matchedUser.id,
        claimedAt: attemptAt,
        payoutTxHash: payout.txHash,
        payoutProofUrl: payout.proofUrl ?? null,
        errorState: null,
        payoutAttemptedAt: attemptAt,
        note: compactSettlementNote(
          market?.title || claim.displayPlayerName,
          claim.amountWolo,
          payout.txHash
        ),
      },
    });

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
