import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import {
  visibleMainnetFundedBetWagerWhere as visibleMainnetWagerWhere,
} from "@/lib/betStakeFunding";
import { loadBetBoardSnapshot, type BetBoardSnapshot } from "@/lib/bets";
import { queueBetMarketEnsure } from "@/lib/betMarketEnsureQueue";
import type {
  LobbyWoloEarnersBoard,
  LobbyWoloEarnersMode,
  LobbyWoloSnapshot,
} from "@/lib/lobby";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import {
  buildClaimedPlayerHref,
  buildReplayPlayerHref,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";
import { getWoloMainnetDisplayStartAt, isWoloMainnet } from "@/lib/woloChain";

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

export type WarChestMode = LobbyWoloEarnersMode;

export function normalizeWarChestMode(value: string | null | undefined): WarChestMode {
  return value === "all_time" ? "all_time" : "weekly";
}

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

function visibleMainnetClaimWhere(
  extra: Prisma.PendingWoloClaimWhereInput = {}
): Prisma.PendingWoloClaimWhereInput {
  if (!isWoloMainnet()) return extra;
  return {
    ...extra,
    createdAt: { gte: getWoloMainnetDisplayStartAt() },
  };
}

export async function loadWarChestSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null,
  options: { mode?: WarChestMode } = {}
): Promise<WarChestSnapshot> {
  const mode = options.mode ?? "weekly";

  // Reconciliation may call external settlement rails and should not hold the
  // public page response open. Queue it once, then start every independent
  // evidence family immediately. Weekly aggregates alone depend on the earners
  // window, so only that small rail waits for the period boundary.
  queueBetMarketEnsure(prisma);

  const sharedSnapshotPromise = Promise.all([
    loadBetBoardSnapshot(prisma, viewerUid, {
      ensureMarkets: false,
      settlementSurfaceMode: "fast",
    }),
    loadWoloDevSnapshot(),
    prisma.betWager.aggregate({
      where: visibleMainnetWagerWhere(),
      _sum: {
        amountWolo: true,
        payoutWolo: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.pendingWoloClaim.aggregate({
      where: visibleMainnetClaimWhere({
        status: "pending",
        rescindedAt: null,
      }),
      _sum: {
        amountWolo: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.betWager.findMany({
      where: visibleMainnetWagerWhere(),
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
      where: visibleMainnetClaimWhere({
        rescindedAt: null,
      }),
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
        ...(isWoloMainnet()
          ? {
              wagers: {
                some: visibleMainnetWagerWhere(),
              },
            }
          : {}),
      },
    }),
  ]);

  const earners = await loadLobbyWoloEarnersBoard(
    prisma,
    { mode },
  );
  const weekStartsAt = new Date(earners.weekStartsAt);
  const weeklyWindowStart = Number.isNaN(weekStartsAt.getTime())
    ? new Date(Date.now() - earners.timeframeDays * 24 * 60 * 60 * 1000)
    : weekStartsAt;
  const weeklyWagerWhere = visibleMainnetWagerWhere({
    createdAt: { gte: weeklyWindowStart },
  });

  const weeklySnapshotPromise = Promise.all([
    prisma.betWager.aggregate({
      where: weeklyWagerWhere,
      _sum: {
        amountWolo: true,
        payoutWolo: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.betWager.groupBy({
      by: ["userId"],
      where: weeklyWagerWhere,
    }),
    prisma.betWager.aggregate({
      where: visibleMainnetWagerWhere({
        createdAt: { gte: weeklyWindowStart },
        executionMode: "onchain_escrow",
      }),
      _sum: {
        amountWolo: true,
      },
    }),
  ]);

  const [
    [
      weeklyWagerSummary,
      weeklyBettors,
      weeklyOnchainEscrow,
    ],
    [
      betBoard,
      wolo,
      lifetimeWagers,
      pendingSummary,
      recentWagersRaw,
      recentClaimsRaw,
      settledMarketCount,
    ],
  ] = await Promise.all([
    weeklySnapshotPromise,
    sharedSnapshotPromise,
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
      volumeWolo: weeklyWagerSummary._sum.amountWolo ?? 0,
      paidOutWolo: weeklyWagerSummary._sum.payoutWolo ?? 0,
      activeBettors: weeklyBettors.length,
      slips: weeklyWagerSummary._count._all,
      onchainEscrowedWolo: weeklyOnchainEscrow._sum.amountWolo ?? 0,
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
