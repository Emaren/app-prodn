import type { PrismaClient } from "@/lib/generated/prisma";

import { loadBetBoardSnapshot, type BetBoardSnapshot } from "@/lib/bets";
import type { LobbyWoloEarnersBoard, LobbyWoloSnapshot } from "@/lib/lobby";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import {
  buildClaimedPlayerHref,
  buildReplayPlayerHref,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";

export type WarChestRecentWager = {
  id: number;
  actorName: string;
  actorHref: string;
  verified: boolean;
  amountWolo: number;
  payoutWolo: number | null;
  status: string;
  executionMode: string;
  createdAt: string;
  marketTitle: string;
  eventLabel: string;
  pickedLabel: string;
};

export type WarChestRecentClaim = {
  id: number;
  playerName: string;
  href: string;
  amountWolo: number;
  status: string;
  createdAt: string;
  claimedAt: string | null;
  payoutAttemptedAt: string | null;
  payoutTxHash: string | null;
  errorState: string | null;
  note: string | null;
};

export type WarChestSnapshot = {
  generatedAt: string;
  wolo: LobbyWoloSnapshot | null;
  earners: LobbyWoloEarnersBoard;
  betBoard: BetBoardSnapshot;
  weekly: {
    volumeWolo: number;
    paidOutWolo: number;
    activeBettors: number;
    slips: number;
    onchainEscrowedWolo: number;
    pendingClaims: number;
    pendingWolo: number;
  };
  lifetime: {
    totalWageredWolo: number;
    totalPayoutWolo: number;
    totalParticipants: number;
    settledMarkets: number;
    openMarkets: number;
  };
  recentWagers: WarChestRecentWager[];
  recentClaims: WarChestRecentClaim[];
};

function resolvePlayerHref(input: {
  uid: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  if (input.uid) {
    return buildClaimedPlayerHref(input.uid);
  }

  const replayName =
    normalizePublicPlayerName(input.inGameName) || normalizePublicPlayerName(input.steamPersonaName);
  return buildReplayPlayerHref(replayName || "Unknown player");
}

function displayActorName(input: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return (
    normalizePublicPlayerName(input.inGameName) ||
    normalizePublicPlayerName(input.steamPersonaName) ||
    input.uid
  );
}

export async function loadWarChestSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<WarChestSnapshot> {
  const [wolo, earners, betBoard] = await Promise.all([
    loadWoloDevSnapshot(),
    loadLobbyWoloEarnersBoard(prisma),
    loadBetBoardSnapshot(prisma, viewerUid),
  ]);

  const weekStartsAt = new Date(earners.weekStartsAt);
  const weeklyWindowStart = Number.isNaN(weekStartsAt.getTime())
    ? new Date(Date.now() - earners.timeframeDays * 24 * 60 * 60 * 1000)
    : weekStartsAt;

  const [
    weeklyWagers,
    lifetimeWagers,
    pendingSummary,
    recentWagersRaw,
    recentClaimsRaw,
    settledMarketCount,
  ] = await Promise.all([
    prisma.betWager.findMany({
      where: {
        createdAt: { gte: weeklyWindowStart },
      },
      select: {
        userId: true,
        amountWolo: true,
        payoutWolo: true,
        executionMode: true,
        status: true,
      },
    }),
    prisma.betWager.aggregate({
      _sum: {
        amountWolo: true,
        payoutWolo: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.pendingWoloClaim.aggregate({
      where: {
        status: "pending",
        rescindedAt: null,
      },
      _sum: {
        amountWolo: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.betWager.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        amountWolo: true,
        payoutWolo: true,
        status: true,
        executionMode: true,
        createdAt: true,
        side: true,
        market: {
          select: {
            title: true,
            eventLabel: true,
            leftLabel: true,
            rightLabel: true,
          },
        },
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            verified: true,
          },
        },
      },
    }),
    prisma.pendingWoloClaim.findMany({
      where: {
        rescindedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        displayPlayerName: true,
        amountWolo: true,
        status: true,
        createdAt: true,
        claimedAt: true,
        payoutAttemptedAt: true,
        payoutTxHash: true,
        errorState: true,
        note: true,
      },
    }),
    prisma.betMarket.count({
      where: {
        status: "settled",
      },
    }),
  ]);

  const recentWagers = recentWagersRaw.map((wager) => ({
    id: wager.id,
    actorName: displayActorName(wager.user),
    actorHref: resolvePlayerHref(wager.user),
    verified: wager.user.verified,
    amountWolo: wager.amountWolo,
    payoutWolo: wager.payoutWolo ?? null,
    status: wager.status,
    executionMode: wager.executionMode,
    createdAt: wager.createdAt.toISOString(),
    marketTitle: wager.market.title,
    eventLabel: wager.market.eventLabel,
    pickedLabel: wager.side === "left" ? wager.market.leftLabel : wager.market.rightLabel,
  }));

  const recentClaims = recentClaimsRaw.map((claim) => {
    const playerName = normalizePublicPlayerName(claim.displayPlayerName) || "Unknown player";

    return {
      id: claim.id,
      playerName,
      href: buildReplayPlayerHref(playerName),
      amountWolo: claim.amountWolo,
      status: claim.status,
      createdAt: claim.createdAt.toISOString(),
      claimedAt: claim.claimedAt?.toISOString() ?? null,
      payoutAttemptedAt: claim.payoutAttemptedAt?.toISOString() ?? null,
      payoutTxHash: claim.payoutTxHash ?? null,
      errorState: claim.errorState ?? null,
      note: claim.note ?? null,
    } satisfies WarChestRecentClaim;
  });

  return {
    generatedAt: new Date().toISOString(),
    wolo,
    earners,
    betBoard,
    weekly: {
      volumeWolo: weeklyWagers.reduce((sum, wager) => sum + wager.amountWolo, 0),
      paidOutWolo: weeklyWagers.reduce((sum, wager) => sum + (wager.payoutWolo ?? 0), 0),
      activeBettors: new Set(weeklyWagers.map((wager) => wager.userId)).size,
      slips: weeklyWagers.length,
      onchainEscrowedWolo: weeklyWagers.reduce(
        (sum, wager) => sum + (wager.executionMode === "onchain_escrow" ? wager.amountWolo : 0),
        0
      ),
      pendingClaims: pendingSummary._count._all,
      pendingWolo: pendingSummary._sum.amountWolo ?? 0,
    },
    lifetime: {
      totalWageredWolo: lifetimeWagers._sum.amountWolo ?? 0,
      totalPayoutWolo: lifetimeWagers._sum.payoutWolo ?? 0,
      totalParticipants: earners.totalParticipants,
      settledMarkets: settledMarketCount,
      openMarkets: betBoard.openMarkets.length,
    },
    recentWagers,
    recentClaims,
  };
}
