import type { PrismaClient } from "@/lib/generated/prisma";

import { findMatchedClaimUser } from "@/lib/adminWoloClaims";
import { createPendingWoloClaim } from "@/lib/pendingWoloClaims";
import { recordUserActivity } from "@/lib/userExperience";
import {
  executeWoloPayout,
  hasWoloPayoutExecutionConfigured,
} from "@/lib/woloBetSettlement";

export type FounderBonusType = "participants" | "winner";

export class FounderBonusError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeFounderBonusType(value: unknown): FounderBonusType | null {
  return value === "winner" ? "winner" : value === "participants" ? "participants" : null;
}

function normalizeFounderAmount(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : NaN;
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 50_000) return null;
  return rounded;
}

function founderTargetScope(bonusType: FounderBonusType) {
  return bonusType === "winner" ? "winner_only" : "both_participants";
}

function founderClaimKind(bonusType: FounderBonusType) {
  return bonusType === "winner" ? "founders_win" : "founders_bonus";
}

function founderGroupKey(bonusId: number, targetKey: string) {
  return `founder:${bonusId}:${targetKey}`.slice(0, 80);
}

function displayUserName(user: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
} | null | undefined) {
  return user?.inGameName || user?.steamPersonaName || user?.uid || "Admin";
}

function summarizeFounderStatus(claims: Array<{
  status: string;
  errorState: string | null;
  claimedAt: Date | null;
  rescindedAt: Date | null;
}>) {
  if (claims.length === 0) {
    return {
      status: "armed",
      settledAt: null as Date | null,
      rescindedAt: null as Date | null,
      failureReason: null as string | null,
    };
  }

  const claimedCount = claims.filter((claim) => claim.status === "claimed").length;
  const pendingCount = claims.filter((claim) => claim.status === "pending").length;
  const rescindedCount = claims.filter((claim) => claim.status === "rescinded").length;
  const failureReason = claims.find((claim) => claim.errorState)?.errorState ?? null;
  const latestClaimedAt = claims
    .map((claim) => claim.claimedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const latestRescindedAt = claims
    .map((claim) => claim.rescindedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

  if (rescindedCount === claims.length) {
    return {
      status: "rescinded",
      settledAt: null,
      rescindedAt: latestRescindedAt,
      failureReason,
    };
  }

  if (claimedCount === claims.length) {
    return {
      status: "settled",
      settledAt: latestClaimedAt,
      rescindedAt: null,
      failureReason: null,
    };
  }

  if (claimedCount > 0 && pendingCount > 0) {
    return {
      status: "partial",
      settledAt: latestClaimedAt,
      rescindedAt: null,
      failureReason,
    };
  }

  if (pendingCount > 0 && failureReason) {
    return {
      status: "failed",
      settledAt: latestClaimedAt,
      rescindedAt: null,
      failureReason,
    };
  }

  if (pendingCount > 0) {
    return {
      status: "pending",
      settledAt: latestClaimedAt,
      rescindedAt: null,
      failureReason: null,
    };
  }

  return {
    status: "partial",
    settledAt: latestClaimedAt,
    rescindedAt: latestRescindedAt,
    failureReason,
  };
}

export async function syncFounderBonusStatus(
  prisma: PrismaClient,
  founderBonusIds: number[]
) {
  const uniqueIds = Array.from(
    new Set(founderBonusIds.filter((value) => Number.isFinite(value) && value > 0))
  );
  if (uniqueIds.length === 0) {
    return;
  }

  const bonuses = await prisma.betMarketFounderBonus.findMany({
    where: {
      id: { in: uniqueIds },
    },
    include: {
      claims: {
        select: {
          status: true,
          errorState: true,
          claimedAt: true,
          rescindedAt: true,
        },
      },
    },
  });

  await Promise.all(
    bonuses.map(async (bonus) => {
      const summary = summarizeFounderStatus(bonus.claims);
      if (
        bonus.status === summary.status &&
        (bonus.failureReason ?? null) === summary.failureReason &&
        (bonus.settledAt?.toISOString() ?? null) === (summary.settledAt?.toISOString() ?? null) &&
        (bonus.rescindedAt?.toISOString() ?? null) === (summary.rescindedAt?.toISOString() ?? null)
      ) {
        return;
      }

      await prisma.betMarketFounderBonus.update({
        where: { id: bonus.id },
        data: {
          status: summary.status,
          failureReason: summary.failureReason,
          settledAt: summary.settledAt,
          rescindedAt: summary.rescindedAt,
        },
      });
    })
  );
}

export async function settleFounderBonuses(
  prisma: PrismaClient,
  options?: {
    marketIds?: number[];
    founderBonusIds?: number[];
  }
) {
  const bonuses = await prisma.betMarketFounderBonus.findMany({
    where: {
      rescindedAt: null,
      ...(options?.marketIds?.length
        ? { marketId: { in: options.marketIds } }
        : {}),
      ...(options?.founderBonusIds?.length
        ? { id: { in: options.founderBonusIds } }
        : {}),
      status: {
        in: ["armed", "pending", "partial", "failed"],
      },
    },
    include: {
      market: {
        select: {
          id: true,
          title: true,
          eventLabel: true,
          leftLabel: true,
          rightLabel: true,
          winnerSide: true,
          status: true,
          linkedGameStatsId: true,
        },
      },
      createdBy: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      claims: {
        select: {
          id: true,
          claimGroupKey: true,
          status: true,
          errorState: true,
          claimedAt: true,
          rescindedAt: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const touchedFounderBonusIds = new Set<number>();

  for (const bonus of bonuses) {
    const bonusType = normalizeFounderBonusType(bonus.bonusType);
    if (!bonusType) {
      continue;
    }

    const marketSettled =
      bonus.market.status === "settled" &&
      (bonusType === "participants" ||
        bonus.market.winnerSide === "left" ||
        bonus.market.winnerSide === "right");

    if (!marketSettled) {
      touchedFounderBonusIds.add(bonus.id);
      continue;
    }

    const targets =
      bonusType === "participants"
        ? [
            {
              playerName: bonus.market.leftLabel,
              amountWolo: Math.floor(bonus.totalAmountWolo / 2),
              targetKey: "left",
            },
            {
              playerName: bonus.market.rightLabel,
              amountWolo: Math.ceil(bonus.totalAmountWolo / 2),
              targetKey: "right",
            },
          ]
        : [
            {
              playerName:
                bonus.market.winnerSide === "right"
                  ? bonus.market.rightLabel
                  : bonus.market.leftLabel,
              amountWolo: bonus.totalAmountWolo,
              targetKey: "winner",
            },
          ];

    const existingGroups = new Set(bonus.claims.map((claim) => claim.claimGroupKey));

    for (const target of targets) {
      if (target.amountWolo < 1) {
        continue;
      }

      const groupKey = founderGroupKey(bonus.id, target.targetKey);
      if (existingGroups.has(groupKey)) {
        continue;
      }

      const matchedUser = await findMatchedClaimUser(prisma, {
        displayPlayerName: target.playerName,
        normalizedPlayerName: target.playerName.trim().toLowerCase(),
      });
      const attemptAt = new Date();
      const claimKind = founderClaimKind(bonusType);
      const targetScope = founderTargetScope(bonusType);
      const creatorName = displayUserName(bonus.createdBy);

      try {
        if (!hasWoloPayoutExecutionConfigured()) {
          throw new Error("Settlement execution is not configured in this environment.");
        }
        if (!matchedUser?.walletAddress) {
          throw new Error("No verified wallet-linked user matches this founder payout target yet.");
        }

        const payout = await executeWoloPayout({
          toAddress: matchedUser.walletAddress,
          amountWolo: target.amountWolo,
          memo: `${bonus.market.title} · ${claimKind}`,
        });

        if (!payout?.txHash) {
          throw new Error("Founder payout execution returned no transaction hash.");
        }

        await createPendingWoloClaim(prisma, {
          playerName: target.playerName,
          displayPlayerName: target.playerName,
          amountWolo: target.amountWolo,
          claimKind,
          claimGroupKey: groupKey,
          targetScope,
          sourceMarketId: bonus.marketId,
          sourceGameStatsId: bonus.market.linkedGameStatsId ?? null,
          sourceFounderBonusId: bonus.id,
          payoutTxHash: payout.txHash,
          payoutProofUrl: payout.proofUrl ?? null,
          errorState: null,
          payoutAttemptedAt: attemptAt,
          note:
            bonusType === "winner"
              ? `Founders Win · ${creatorName} added ${bonus.totalAmountWolo} WOLO`
              : `Founders Bonus · ${creatorName} added ${bonus.totalAmountWolo} WOLO`,
          status: "claimed",
          claimedByUserId: matchedUser.id,
          claimedAt: attemptAt,
        });
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : "Founder payout could not be settled.";

        await createPendingWoloClaim(prisma, {
          playerName: target.playerName,
          displayPlayerName: target.playerName,
          amountWolo: target.amountWolo,
          claimKind,
          claimGroupKey: groupKey,
          targetScope,
          sourceMarketId: bonus.marketId,
          sourceGameStatsId: bonus.market.linkedGameStatsId ?? null,
          sourceFounderBonusId: bonus.id,
          errorState: detail.trim().replace(/\s+/g, " ").slice(0, 255),
          payoutAttemptedAt: attemptAt,
          note:
            bonusType === "winner"
              ? `Founders Win · ${creatorName} added ${bonus.totalAmountWolo} WOLO`
              : `Founders Bonus · ${creatorName} added ${bonus.totalAmountWolo} WOLO`,
          status: "pending",
        });
      }

      touchedFounderBonusIds.add(bonus.id);
    }
  }

  if (touchedFounderBonusIds.size > 0) {
    await syncFounderBonusStatus(prisma, [...touchedFounderBonusIds]);
  }
}

export async function createFounderBonus(
  prisma: PrismaClient,
  input: {
    marketId: number;
    bonusType: unknown;
    amountWolo: unknown;
    note?: string | null;
    createdByUserId: number;
  }
) {
  const bonusType = normalizeFounderBonusType(input.bonusType);
  if (!bonusType) {
    throw new FounderBonusError(400, "Founder bonus type is required.");
  }

  const amountWolo = normalizeFounderAmount(input.amountWolo);
  if (!amountWolo) {
    throw new FounderBonusError(400, "Founder bonus amount must be a whole number of WOLO.");
  }

  if (bonusType === "participants" && amountWolo % 2 !== 0) {
    throw new FounderBonusError(400, "Founders Bonus must be an even WOLO amount so it can split evenly.");
  }

  const market = await prisma.betMarket.findUnique({
    where: { id: input.marketId },
    select: {
      id: true,
      title: true,
      status: true,
    },
  });

  if (!market) {
    throw new FounderBonusError(404, "Market not found.");
  }

  const created = await prisma.betMarketFounderBonus.create({
    data: {
      marketId: market.id,
      bonusType,
      totalAmountWolo: amountWolo,
      note: input.note?.trim().slice(0, 160) || null,
      createdByUserId: input.createdByUserId,
      status: market.status === "settled" ? "pending" : "armed",
    },
  });

  await recordUserActivity(prisma, {
    userId: input.createdByUserId,
    type: bonusType === "winner" ? "founders_win_added" : "founders_bonus_added",
    path: "/bets",
    label: market.title,
    metadata: {
      marketId: market.id,
      founderBonusId: created.id,
      bonusType,
      amountWolo,
      note: created.note,
    },
    dedupeWithinSeconds: 0,
  });

  await settleFounderBonuses(prisma, {
    marketIds: [market.id],
    founderBonusIds: [created.id],
  });

  return created;
}
