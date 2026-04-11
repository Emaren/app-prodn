import type { PrismaClient } from "@/lib/generated/prisma";

import { createPendingWoloClaim } from "@/lib/pendingWoloClaims";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
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

type WalletLinkedFounderUser = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress: string | null;
  verified: boolean;
  verificationLevel: number;
  steamId: string | null;
};

type FounderResolutionResult = {
  matchedUser: Pick<
    WalletLinkedFounderUser,
    "id" | "inGameName" | "steamPersonaName" | "walletAddress"
  > | null;
  matchedBy: string | null;
  detail: string | null;
};

type FounderResolutionMarket = {
  id: number;
  title: string;
  leftLabel: string;
  rightLabel: string;
  winnerSide: string | null;
  scheduledMatch: {
    challenger: WalletLinkedFounderUser;
    challenged: WalletLinkedFounderUser;
    linkedWinner: string | null;
  } | null;
  linkedGameStats: {
    winner: string | null;
  } | null;
};

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

function isAwaitingVerifiedWalletLinkDetail(value: string | null | undefined) {
  return /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
    value || ""
  );
}

function normalizeFounderNameKey(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase();
}

function isTrustedWalletLinkedUser(
  user: WalletLinkedFounderUser | null | undefined
): user is WalletLinkedFounderUser & { walletAddress: string } {
  return Boolean(
    user?.walletAddress &&
      (user.verified ||
        (typeof user.verificationLevel === "number" && user.verificationLevel > 0) ||
        user.steamId)
  );
}

function uniqueFounderNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizePublicPlayerName(value);
    const key = normalizeFounderNameKey(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function pickExactFounderUserMatch(
  userPool: WalletLinkedFounderUser[],
  field: "inGameName" | "steamPersonaName",
  value: string | null | undefined
) {
  const targetKey = normalizeFounderNameKey(value);
  if (!targetKey) return null;

  return (
    userPool.find((user) => normalizeFounderNameKey(user[field]) === targetKey) ?? null
  );
}

function pickNormalizedFounderUserMatch(
  userPool: WalletLinkedFounderUser[],
  value: string | null | undefined
) {
  const targetKey = normalizeFounderNameKey(value);
  if (!targetKey) return null;

  return (
    userPool.find((user) => {
      const keys = [user.inGameName, user.steamPersonaName].map(normalizeFounderNameKey).filter(Boolean);
      return keys.includes(targetKey);
    }) ?? null
  );
}

function matchFounderTargetByName(
  userPool: WalletLinkedFounderUser[],
  value: string | null | undefined
): FounderResolutionResult | null {
  const exactInGame = pickExactFounderUserMatch(userPool, "inGameName", value);
  if (exactInGame) {
    return {
      matchedUser: exactInGame,
      matchedBy: "exact_in_game_name",
      detail: null,
    };
  }

  const exactSteam = pickExactFounderUserMatch(userPool, "steamPersonaName", value);
  if (exactSteam) {
    return {
      matchedUser: exactSteam,
      matchedBy: "exact_steam_persona_name",
      detail: null,
    };
  }

  const normalized = pickNormalizedFounderUserMatch(userPool, value);
  if (normalized) {
    return {
      matchedUser: normalized,
      matchedBy: "normalized_player_name",
      detail: null,
    };
  }

  return null;
}

function founderTargetLabel(
  bonusType: FounderBonusType,
  targetKey: string,
  playerName: string
) {
  if (bonusType === "winner" || targetKey === "winner") {
    return `winner target "${playerName}"`;
  }
  if (targetKey === "left") {
    return `left-side target "${playerName}"`;
  }
  if (targetKey === "right") {
    return `right-side target "${playerName}"`;
  }
  return `target "${playerName}"`;
}

function unresolvedFounderTargetDetail(
  bonusType: FounderBonusType,
  targetKey: string,
  playerName: string
) {
  return `Awaiting verified wallet-linked account for ${founderTargetLabel(
    bonusType,
    targetKey,
    playerName
  )}. This payout stays pending until the player links a verified wallet.`;
}

function resolveScheduledMatchSideUser(
  market: FounderResolutionMarket,
  targetKey: string
) {
  if (!market.scheduledMatch) return null;
  if (targetKey === "left") {
    return market.scheduledMatch.challenger;
  }
  if (targetKey === "right") {
    return market.scheduledMatch.challenged;
  }
  return null;
}

function resolveWinnerSideUser(market: FounderResolutionMarket) {
  if (!market.scheduledMatch) return null;
  if (market.winnerSide === "left") {
    return market.scheduledMatch.challenger;
  }
  if (market.winnerSide === "right") {
    return market.scheduledMatch.challenged;
  }
  return null;
}

function buildMarketSideIdentityNames(
  market: FounderResolutionMarket,
  targetKey: string
) {
  const sideUser = resolveScheduledMatchSideUser(market, targetKey);
  const sideLabel =
    targetKey === "right" ? market.rightLabel : targetKey === "left" ? market.leftLabel : null;

  return uniqueFounderNames([
    sideLabel,
    sideUser?.inGameName,
    sideUser?.steamPersonaName,
    sideUser?.uid,
  ]);
}

function buildWinnerIdentityNames(market: FounderResolutionMarket) {
  const winnerUser = resolveWinnerSideUser(market);
  const winnerSideLabel =
    market.winnerSide === "left"
      ? market.leftLabel
      : market.winnerSide === "right"
        ? market.rightLabel
        : null;

  return uniqueFounderNames([
    market.linkedGameStats?.winner,
    market.scheduledMatch?.linkedWinner,
    winnerSideLabel,
    winnerUser?.inGameName,
    winnerUser?.steamPersonaName,
    winnerUser?.uid,
  ]);
}

function resolveFounderTargetUser(
  userPool: WalletLinkedFounderUser[],
  input: {
    bonusType: FounderBonusType;
    targetKey: string;
    playerName: string;
    market: FounderResolutionMarket;
  }
): FounderResolutionResult {
  const directMatch = matchFounderTargetByName(userPool, input.playerName);
  if (directMatch) {
    return directMatch;
  }

  if (input.targetKey === "left" || input.targetKey === "right") {
    const sideUser = resolveScheduledMatchSideUser(input.market, input.targetKey);
    if (isTrustedWalletLinkedUser(sideUser)) {
      return {
        matchedUser: sideUser,
        matchedBy: `market_side_${input.targetKey}_identity`,
        detail: null,
      };
    }

    for (const candidateName of buildMarketSideIdentityNames(input.market, input.targetKey)) {
      const sideMatch = matchFounderTargetByName(userPool, candidateName);
      if (sideMatch) {
        return {
          ...sideMatch,
          matchedBy: `market_side_${input.targetKey}_${sideMatch.matchedBy}`,
        };
      }
    }
  }

  if (input.targetKey === "winner" || input.bonusType === "winner") {
    const winnerUser = resolveWinnerSideUser(input.market);
    if (isTrustedWalletLinkedUser(winnerUser)) {
      return {
        matchedUser: winnerUser,
        matchedBy: "winner_side_identity",
        detail: null,
      };
    }

    for (const candidateName of buildWinnerIdentityNames(input.market)) {
      const winnerMatch = matchFounderTargetByName(userPool, candidateName);
      if (winnerMatch) {
        return {
          ...winnerMatch,
          matchedBy: `winner_side_${winnerMatch.matchedBy}`,
        };
      }
    }
  }

  return {
    matchedUser: null,
    matchedBy: null,
    detail: unresolvedFounderTargetDetail(
      input.bonusType,
      input.targetKey,
      input.playerName
    ),
  };
}

export async function resolveFounderClaimTargetUser(
  prisma: PrismaClient,
  input: {
    sourceFounderBonusId: number;
    displayPlayerName: string;
    claimGroupKey?: string | null;
    targetScope?: string | null;
  }
): Promise<FounderResolutionResult> {
  const founderBonus = await prisma.betMarketFounderBonus.findUnique({
    where: { id: input.sourceFounderBonusId },
    select: {
      id: true,
      bonusType: true,
      market: {
        select: {
          id: true,
          title: true,
          leftLabel: true,
          rightLabel: true,
          winnerSide: true,
          scheduledMatch: {
            select: {
              linkedWinner: true,
              challenger: {
                select: {
                  id: true,
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                  walletAddress: true,
                  verified: true,
                  verificationLevel: true,
                  steamId: true,
                },
              },
              challenged: {
                select: {
                  id: true,
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
          linkedGameStats: {
            select: {
              winner: true,
            },
          },
        },
      },
    },
  });

  const bonusType = normalizeFounderBonusType(founderBonus?.bonusType);
  if (!founderBonus || !bonusType) {
    return {
      matchedUser: null,
      matchedBy: null,
      detail: "Founder payout context is missing from AoE2HDBets for this claim.",
    };
  }

  const targetKey =
    input.claimGroupKey?.startsWith(`founder:${input.sourceFounderBonusId}:`)
      ? input.claimGroupKey.slice(`founder:${input.sourceFounderBonusId}:`.length)
      : bonusType === "winner"
        ? "winner"
        : input.targetScope === "both_participants"
          ? normalizeFounderNameKey(input.displayPlayerName) === normalizeFounderNameKey(founderBonus.market.rightLabel)
            ? "right"
            : "left"
          : "winner";

  const userPool = await prisma.user.findMany({
    where: {
      walletAddress: { not: null },
      AND: [
        { OR: [{ verified: true }, { verificationLevel: { gt: 0 } }, { steamId: { not: null } }] },
        { OR: [{ inGameName: { not: null } }, { steamPersonaName: { not: null } }] },
      ],
    },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
      verified: true,
      verificationLevel: true,
      steamId: true,
    },
  });

  return resolveFounderTargetUser(userPool, {
    bonusType,
    targetKey,
    playerName: input.displayPlayerName,
    market: founderBonus.market,
  });
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
  const unresolvedReason =
    claims.find((claim) => isAwaitingVerifiedWalletLinkDetail(claim.errorState))?.errorState ??
    null;
  const failureReason =
    claims.find(
      (claim) => claim.errorState && !isAwaitingVerifiedWalletLinkDetail(claim.errorState)
    )?.errorState ?? null;
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
      failureReason: failureReason ?? unresolvedReason,
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
      failureReason: unresolvedReason,
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
          scheduledMatch: {
            select: {
              linkedWinner: true,
              challenger: {
                select: {
                  id: true,
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                  walletAddress: true,
                  verified: true,
                  verificationLevel: true,
                  steamId: true,
                },
              },
              challenged: {
                select: {
                  id: true,
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
          linkedGameStats: {
            select: {
              winner: true,
            },
          },
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
  const founderUserPool = bonuses.length
    ? await prisma.user.findMany({
        where: {
          walletAddress: { not: null },
          AND: [
            { OR: [{ verified: true }, { verificationLevel: { gt: 0 } }, { steamId: { not: null } }] },
            { OR: [{ inGameName: { not: null } }, { steamPersonaName: { not: null } }] },
          ],
        },
        select: {
          id: true,
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          walletAddress: true,
          verified: true,
          verificationLevel: true,
          steamId: true,
        },
      })
    : [];

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

      const resolution = resolveFounderTargetUser(founderUserPool, {
        bonusType,
        targetKey: target.targetKey,
        playerName: target.playerName,
        market: bonus.market,
      });
      const claimKind = founderClaimKind(bonusType);
      const targetScope = founderTargetScope(bonusType);
      const creatorName = displayUserName(bonus.createdBy);

      if (!resolution.matchedUser?.walletAddress) {
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
          errorState: (resolution.detail || unresolvedFounderTargetDetail(
            bonusType,
            target.targetKey,
            target.playerName
          ))
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 255),
          payoutAttemptedAt: null,
          note:
            bonusType === "winner"
              ? `Founders Win · ${creatorName} added ${bonus.totalAmountWolo} WOLO`
              : `Founders Bonus · ${creatorName} added ${bonus.totalAmountWolo} WOLO`,
          status: "pending",
        });

        touchedFounderBonusIds.add(bonus.id);
        continue;
      }

      const attemptAt = new Date();

      try {
        if (!hasWoloPayoutExecutionConfigured()) {
          throw new Error("Settlement execution is not configured in this environment.");
        }

        const payout = await executeWoloPayout({
          toAddress: resolution.matchedUser.walletAddress,
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
          claimedByUserId: resolution.matchedUser.id,
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
