import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@/lib/generated/prisma";

import { loadUserCommunitySummaries } from "@/lib/communityHonors";
import { loadInboxPayload } from "@/lib/contactInbox";
import { requireAdmin } from "@/lib/adminSession";
import {
  loadAppearancePreferenceMap,
  loadRecentActivityMap,
} from "@/lib/userExperience";
import { loadPendingWoloClaimsForAdmin, normalizePendingWoloClaimName } from "@/lib/pendingWoloClaims";
import {
  isBetStakeIntentCountableStatus,
  refreshRecoverableBetStakeIntents,
} from "@/lib/betStakeIntents";
import { loadWatcherDownloadAnalytics } from "@/lib/watcherDownloads";
import { getWoloSettlementSurfaceStatus } from "@/lib/woloBetSettlement";
import { buildWoloRestTxLookupUrl, getWoloBetEscrowRuntime } from "@/lib/woloChain";

function buildPairKey(leftUserId: number, rightUserId: number) {
  return [leftUserId, rightUserId].sort((a, b) => a - b).join(":");
}

async function loadUserUnreadFromAdminCount(
  prisma: PrismaClient,
  adminUserId: number,
  targetUserId: number,
  targetLastReadAt: Date | null
) {
  const sinceFilter = targetLastReadAt ? { createdAt: { gt: targetLastReadAt } } : {};

  const [unreadMessages, unreadBadges, unreadGifts] = await Promise.all([
    prisma.directMessage.count({
      where: {
        senderUserId: adminUserId,
        conversation: {
          is: {
            pairKey: buildPairKey(adminUserId, targetUserId),
          },
        },
        ...sinceFilter,
      },
    }),
    prisma.userBadge.count({
      where: {
        userId: targetUserId,
        createdByUserId: adminUserId,
        ...sinceFilter,
      },
    }),
    prisma.userGift.count({
      where: {
        userId: targetUserId,
        createdByUserId: adminUserId,
        ...sinceFilter,
      },
    }),
  ]);

  return unreadMessages + unreadBadges + unreadGifts;
}

function userNameKeys(entry: { inGameName: string | null; steamPersonaName: string | null }) {
  return Array.from(
    new Set(
      [entry.inGameName, entry.steamPersonaName]
        .map((value) => normalizePendingWoloClaimName(value))
        .filter(Boolean)
    )
  );
}

function extractPayoutTxHash(note: string | null | undefined) {
  if (!note) return null;
  const match = note.match(/tx\s+([A-Za-z0-9]{16,128})/);
  return match?.[1] ?? null;
}

function extractAutoSettleError(note: string | null | undefined) {
  if (!note) return null;
  const marker = "auto-settle failed:";
  const index = note.toLowerCase().indexOf(marker);
  if (index < 0) return null;
  return note.slice(index + marker.length).trim() || null;
}

function deriveSettlementMode(
  status: "pending" | "claimed" | "rescinded",
  payoutTxHash: string | null
) {
  if (status === "rescinded") return "rescinded" as const;
  if (status === "claimed" && payoutTxHash) return "auto_settled" as const;
  if (status === "claimed") return "claimed_manual" as const;
  return "pending" as const;
}

function resolveSettlementTxHash(claim: {
  payoutTxHash?: string | null;
  note?: string | null;
}) {
  return claim.payoutTxHash?.trim() || extractPayoutTxHash(claim.note);
}

function resolveSettlementError(claim: {
  errorState?: string | null;
  note?: string | null;
}) {
  return claim.errorState?.trim() || extractAutoSettleError(claim.note);
}

function isAwaitingVerifiedWalletLinkDetail(value: string | null | undefined) {
  return /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
    value || ""
  );
}

function displayUserName(entry: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return entry.inGameName || entry.steamPersonaName || entry.uid || "Unknown";
}

function projectReturnWolo(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function isCountableWagerRow(wager: {
  executionMode: string;
  stakeIntent?: { status: string | null } | null;
}) {
  return (
    wager.executionMode !== "onchain_escrow" ||
    isBetStakeIntentCountableStatus(wager.stakeIntent?.status)
  );
}

function resolveExecutionMode(
  executionModes: string[]
): "app_only" | "onchain_escrow" | "mixed" {
  const hasOnchain = executionModes.includes("onchain_escrow");
  const hasAppOnly = executionModes.includes("app_only");

  if (hasOnchain && hasAppOnly) return "mixed";
  if (hasOnchain) return "onchain_escrow";
  return "app_only";
}

function resolveWagerStatus(statuses: string[]): "active" | "won" | "lost" | "void" | "mixed" {
  const unique = Array.from(new Set(statuses.filter(Boolean)));
  if (unique.length === 0) return "active";
  if (unique.length === 1) {
    const status = unique[0];
    if (status === "won" || status === "lost" || status === "void") {
      return status;
    }
    return "active";
  }
  if (unique.includes("active")) return "active";
  return "mixed";
}

function resolveRecoveryState(
  statuses: string[]
): "reconciled" | "pending" | "suspect" | "orphaned" {
  if (statuses.includes("orphaned")) return "orphaned";
  if (statuses.includes("suspect") || statuses.includes("failed")) return "suspect";
  if (
    statuses.includes("awaiting_signature") ||
    statuses.includes("broadcast_submitted") ||
    statuses.includes("verified_unrecorded")
  ) {
    return "pending";
  }
  return "reconciled";
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { prisma, user: admin } = gate;
    const users = await prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        email: true,
        inGameName: true,
        steamPersonaName: true,
        steamId: true,
        verified: true,
        verificationLevel: true,
        createdAt: true,
        lastSeen: true,
        isAdmin: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const userIds = users.map((entry) => entry.id);
    const unresolvedIntentStatuses = [
      "awaiting_signature",
      "broadcast_submitted",
      "verified_unrecorded",
      "failed",
      "suspect",
      "orphaned",
    ] as const;
    const escrowRuntime = getWoloBetEscrowRuntime();

    await refreshRecoverableBetStakeIntents(prisma);

    const [communityMap, inbox, appearanceMap, activityMap, adminMemberships, activityStats, allClaims, scheduledRows, wagerRows, marketRows, settlementSurface, watcherDownloads] = await Promise.all([
      loadUserCommunitySummaries(prisma, userIds, { includePending: true }),
      loadInboxPayload(prisma, admin.uid, { summaryOnly: true }),
      loadAppearancePreferenceMap(prisma, userIds),
      loadRecentActivityMap(prisma, userIds, 20),
      prisma.directConversationParticipant.findMany({
        where: { userId: admin.id },
        include: {
          conversation: {
            include: {
              participants: {
                include: {
                  user: {
                    select: {
                      id: true,
                      uid: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.userActivityEvent.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
        },
        _count: {
          _all: true,
        },
        _max: {
          createdAt: true,
        },
      }),
      loadPendingWoloClaimsForAdmin(prisma, { take: 500 }),
      prisma.scheduledMatch.findMany({
        where: {
          OR: [
            { challengerUserId: { in: userIds } },
            { challengedUserId: { in: userIds } },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          updatedAt: true,
          linkedMapName: true,
          linkedWinner: true,
          challengerUserId: true,
          challengedUserId: true,
          challenger: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
          challenged: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      }),
      prisma.betWager.findMany({
        where: {
          userId: { in: userIds },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        include: {
          market: {
            select: {
              id: true,
              title: true,
              eventLabel: true,
            },
          },
        },
      }),
      prisma.betMarket.findMany({
        where: {
          OR: [
            { status: { in: ["open", "closing", "live"] } },
            { settlementStatus: { not: null } },
            {
              stakeIntents: {
                some: {
                  status: {
                    in: [...unresolvedIntentStatuses],
                  },
                },
              },
            },
          ],
        },
        orderBy: [{ featured: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        take: 12,
        select: {
          id: true,
          title: true,
          eventLabel: true,
          status: true,
          featured: true,
          leftLabel: true,
          rightLabel: true,
          seedLeftWolo: true,
          seedRightWolo: true,
          winnerSide: true,
          settlementRunId: true,
          settlementStatus: true,
          settlementFailureCode: true,
          settlementDetail: true,
          settlementAttemptedAt: true,
          settlementExecutedAt: true,
          wagers: {
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              userId: true,
              side: true,
              amountWolo: true,
              payoutWolo: true,
              status: true,
              executionMode: true,
              stakeTxHash: true,
              stakeWalletAddress: true,
              stakeLockedAt: true,
              payoutTxHash: true,
              payoutProofUrl: true,
              updatedAt: true,
              stakeIntent: {
                select: {
                  status: true,
                },
              },
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
          stakeIntents: {
            where: {
              status: {
                in: [...unresolvedIntentStatuses],
              },
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 24,
            select: {
              id: true,
              userId: true,
              side: true,
              amountWolo: true,
              walletAddress: true,
              status: true,
              stakeTxHash: true,
              errorDetail: true,
              updatedAt: true,
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
          },
        }),
      getWoloSettlementSurfaceStatus(),
      loadWatcherDownloadAnalytics(prisma),
    ]);

    const unreadMap = new Map(
      inbox.summaries.map((summary) => [summary.targetUid, summary.unreadCount] as const)
    );
    const adminConversationMap = new Map<
      number,
      {
        conversationId: number;
        adminLastReadAt: Date | null;
        targetLastReadAt: Date | null;
      }
    >();

    for (const membership of adminMemberships) {
      const counterpart = membership.conversation.participants.find(
        (participant) => participant.userId !== admin.id
      );

      if (!counterpart) {
        continue;
      }

      adminConversationMap.set(counterpart.userId, {
        conversationId: membership.conversationId,
        adminLastReadAt: membership.lastReadAt,
        targetLastReadAt: counterpart.lastReadAt,
      });
    }

    const activityStatsByUserId = new Map(
      activityStats.map((row) => [
        row.userId,
        {
          recentActionsTotalCount: row._count._all,
          lastActivityAt: row._max.createdAt ? row._max.createdAt.toISOString() : null,
        },
      ])
    );

    type SerializedClaim = {
      id: number;
      displayPlayerName: string;
      normalizedPlayerName: string;
      amountWolo: number;
      status: string;
      note: string | null;
      createdAt: string;
      claimedAt: string | null;
      rescindedAt: string | null;
      sourceMarketId: number | null;
      sourceGameStatsId: number | null;
    };

    const claimedClaimsByUserId = new Map<number, SerializedClaim[]>();
    const rescindedClaimsByUserId = new Map<number, SerializedClaim[]>();
    const claimsByName = new Map<string, SerializedClaim[]>();

    for (const claim of allClaims) {
      const serialized = {
        id: claim.id,
        displayPlayerName: claim.displayPlayerName,
        normalizedPlayerName: claim.normalizedPlayerName,
        amountWolo: claim.amountWolo,
        status: claim.status,
        note: claim.note,
        createdAt: claim.createdAt.toISOString(),
        claimedAt: claim.claimedAt?.toISOString() ?? null,
        rescindedAt: claim.rescindedAt?.toISOString() ?? null,
        sourceMarketId: claim.sourceMarketId ?? null,
        sourceGameStatsId: claim.sourceGameStatsId ?? null,
      };

      if (!claimsByName.has(claim.normalizedPlayerName)) {
        claimsByName.set(claim.normalizedPlayerName, []);
      }
      claimsByName.get(claim.normalizedPlayerName)!.push(serialized);

      if (claim.claimedByUserId) {
        if (!claimedClaimsByUserId.has(claim.claimedByUserId)) {
          claimedClaimsByUserId.set(claim.claimedByUserId, []);
        }
        claimedClaimsByUserId.get(claim.claimedByUserId)!.push(serialized);
      }

      if (claim.rescindedByUserId) {
        if (!rescindedClaimsByUserId.has(claim.rescindedByUserId)) {
          rescindedClaimsByUserId.set(claim.rescindedByUserId, []);
        }
        rescindedClaimsByUserId.get(claim.rescindedByUserId)!.push(serialized);
      }
    }

    const scheduledByUserId = new Map<number, Array<{
      id: number;
      status: string;
      role: "challenger" | "challenged";
      opponentName: string;
      opponentUid: string;
      scheduledAt: string;
      activityAt: string;
      linkedMapName: string | null;
      linkedWinner: string | null;
    }>>();

    for (const row of scheduledRows) {
      const challengerName = row.challenger.inGameName || row.challenger.steamPersonaName || row.challenger.uid;
      const challengedName = row.challenged.inGameName || row.challenged.steamPersonaName || row.challenged.uid;
      const activityAt = row.updatedAt.toISOString();

      const challengerList = scheduledByUserId.get(row.challengerUserId) ?? [];
      if (challengerList.length < 8) {
        challengerList.push({
          id: row.id,
          status: row.status,
          role: "challenger",
          opponentName: challengedName,
          opponentUid: row.challenged.uid,
          scheduledAt: row.scheduledAt.toISOString(),
          activityAt,
          linkedMapName: row.linkedMapName ?? null,
          linkedWinner: row.linkedWinner ?? null,
        });
        scheduledByUserId.set(row.challengerUserId, challengerList);
      }

      const challengedList = scheduledByUserId.get(row.challengedUserId) ?? [];
      if (challengedList.length < 8) {
        challengedList.push({
          id: row.id,
          status: row.status,
          role: "challenged",
          opponentName: challengerName,
          opponentUid: row.challenger.uid,
          scheduledAt: row.scheduledAt.toISOString(),
          activityAt,
          linkedMapName: row.linkedMapName ?? null,
          linkedWinner: row.linkedWinner ?? null,
        });
        scheduledByUserId.set(row.challengedUserId, challengedList);
      }
    }

    const wagersByUserId = new Map<number, Array<{
      id: number;
      marketId: number;
      marketTitle: string;
      eventLabel: string;
      side: string;
      amountWolo: number;
      payoutWolo: number | null;
      status: string;
      executionMode: string;
      stakeTxHash: string | null;
      stakeWalletAddress: string | null;
      stakeLockedAt: string | null;
      createdAt: string;
      updatedAt: string;
      settledAt: string | null;
    }>>();
    const betStatsByUserId = new Map<number, {
      activeCount: number;
      wonCount: number;
      lostCount: number;
      stakedWolo: number;
      paidOutWolo: number;
    }>();

    for (const row of wagerRows) {
      const list = wagersByUserId.get(row.userId) ?? [];
      if (list.length < 8) {
        list.push({
          id: row.id,
          marketId: row.marketId,
          marketTitle: row.market.title,
          eventLabel: row.market.eventLabel,
          side: row.side,
          amountWolo: row.amountWolo,
          payoutWolo: row.payoutWolo ?? null,
          status: row.status,
          executionMode: row.executionMode,
          stakeTxHash: row.stakeTxHash ?? null,
          stakeWalletAddress: row.stakeWalletAddress ?? null,
          stakeLockedAt: row.stakeLockedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          settledAt: row.settledAt?.toISOString() ?? null,
        });
        wagersByUserId.set(row.userId, list);
      }

      const stats = betStatsByUserId.get(row.userId) ?? {
        activeCount: 0,
        wonCount: 0,
        lostCount: 0,
        stakedWolo: 0,
        paidOutWolo: 0,
      };

      stats.stakedWolo += row.amountWolo;
      stats.paidOutWolo += row.payoutWolo ?? 0;
      if (row.status === "active") stats.activeCount += 1;
      if (row.status === "won") stats.wonCount += 1;
      if (row.status === "lost") stats.lostCount += 1;
      betStatsByUserId.set(row.userId, stats);
    }

    const userRows = await Promise.all(
      users.map(async (entry) => {
        const community = communityMap.get(entry.id) ?? {
          badges: [],
          gifts: [],
          giftedWolo: 0,
        };
        const appearance = appearanceMap.get(entry.id) ?? null;
        const recentActions = activityMap.get(entry.id) ?? [];
        const conversation = adminConversationMap.get(entry.id);
        const activitySummary = activityStatsByUserId.get(entry.id) ?? {
          recentActionsTotalCount: recentActions.length,
          lastActivityAt:
            recentActions[0]?.createdAt ??
            (entry.lastSeen ? entry.lastSeen.toISOString() : null),
        };

        const userUnreadCount =
          entry.id === admin.id
            ? 0
            : await loadUserUnreadFromAdminCount(
                prisma,
                admin.id,
                entry.id,
                conversation?.targetLastReadAt ?? null
              );

        const pendingClaims: SerializedClaim[] = [];
        for (const key of userNameKeys(entry)) {
          const rows = claimsByName.get(key) ?? [];
          for (const row of rows) {
            if (row.status === "pending" && !pendingClaims.some((claim) => claim.id === row.id)) {
              pendingClaims.push(row);
            }
          }
        }

        const claimedClaims = claimedClaimsByUserId.get(entry.id) ?? [];
        const rescindedClaims = rescindedClaimsByUserId.get(entry.id) ?? [];
        const scheduledMatches = scheduledByUserId.get(entry.id) ?? [];
        const wagers = wagersByUserId.get(entry.id) ?? [];
        const betStats = betStatsByUserId.get(entry.id) ?? {
          activeCount: 0,
          wonCount: 0,
          lostCount: 0,
          stakedWolo: 0,
          paidOutWolo: 0,
        };

        return {
          uid: entry.uid,
          email: entry.email,
          inGameName: entry.inGameName,
          steamPersonaName: entry.steamPersonaName,
          steamId: entry.steamId,
          displayName: entry.inGameName || entry.steamPersonaName || entry.uid,
          verified: entry.verified,
          verificationLevel: entry.verificationLevel,
          createdAt: entry.createdAt.toISOString(),
          lastSeen: entry.lastSeen ? entry.lastSeen.toISOString() : null,
          isAdmin: entry.isAdmin,
          badges: community.badges,
          giftedWolo: community.giftedWolo,
          gifts: community.gifts.slice(0, 8),
          unreadCount: unreadMap.get(entry.uid) ?? 0,
          userUnreadCount,
          lastInboxReadAt: conversation?.targetLastReadAt?.toISOString() ?? null,
          adminLastInboxReadAt: conversation?.adminLastReadAt?.toISOString() ?? null,
          appearance,
          recentActions,
          recentActionsTotalCount: activitySummary.recentActionsTotalCount,
          lastActivityAt: activitySummary.lastActivityAt,
          pendingBadgeCount: community.badges.filter((badge) => badge.status === "pending").length,
          pendingGiftCount: community.gifts.filter((gift) => gift.status === "pending").length,
          pendingWoloClaims: pendingClaims.slice(0, 8),
          pendingWoloClaimCount: pendingClaims.length,
          pendingWoloClaimAmount: pendingClaims.reduce((sum, claim) => sum + claim.amountWolo, 0),
          claimedWoloClaims: claimedClaims.slice(0, 8),
          claimedWoloClaimCount: claimedClaims.length,
          claimedWoloClaimAmount: claimedClaims.reduce((sum, claim) => sum + claim.amountWolo, 0),
          rescindedWoloClaims: rescindedClaims.slice(0, 8),
          scheduledMatches,
          betLedger: wagers,
          betStats,
        };
      })
    );

    const settlementMarketIds = Array.from(
      new Set(
        allClaims
          .map((claim) => claim.sourceMarketId)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      )
    );

    const settlementMarkets = settlementMarketIds.length
      ? await prisma.betMarket.findMany({
          where: { id: { in: settlementMarketIds } },
          select: {
            id: true,
            title: true,
            eventLabel: true,
            leftLabel: true,
            rightLabel: true,
            winnerSide: true,
          },
        })
      : [];

    const settlementMarketById = new Map(
      settlementMarkets.map((market) => [market.id, market] as const)
    );

    const settlementRows = allClaims.slice(0, 60).map((claim) => {
      const market = typeof claim.sourceMarketId === "number"
        ? settlementMarketById.get(claim.sourceMarketId)
        : null;
      const winnerName =
        market?.winnerSide === "left"
          ? market.leftLabel
          : market?.winnerSide === "right"
            ? market.rightLabel
            : null;

      const payoutTxHash = resolveSettlementTxHash(claim);
      const errorState = resolveSettlementError(claim);
      const settlementMode = deriveSettlementMode(
        claim.status as "pending" | "claimed" | "rescinded",
        payoutTxHash
      );

      return {
        id: claim.id,
        marketId: claim.sourceMarketId ?? null,
        marketTitle: market?.title ?? null,
        eventLabel: market?.eventLabel ?? null,
        winnerName,
        displayPlayerName: claim.displayPlayerName,
        amountWolo: claim.amountWolo,
        claimKind: claim.claimKind ?? "bet_payout",
        targetScope: claim.targetScope ?? null,
        sourceFounderBonusId: claim.sourceFounderBonusId ?? null,
        claimStatus: claim.status,
        settlementMode,
        payoutTxHash,
        payoutProofUrl: claim.payoutProofUrl ?? null,
        errorState,
        note: claim.note ?? null,
        payoutAttemptedAt: claim.payoutAttemptedAt?.toISOString() ?? null,
        createdAt: claim.createdAt.toISOString(),
        claimedAt: claim.claimedAt?.toISOString() ?? null,
        rescindedAt: claim.rescindedAt?.toISOString() ?? null,
      };
    });

    const settlementRail = {
      summary: {
        totalCount: allClaims.length,
        totalAmountWolo: allClaims.reduce((sum, claim) => sum + claim.amountWolo, 0),
        pendingCount: allClaims.filter((claim) => claim.status === "pending").length,
        pendingAmountWolo: allClaims
          .filter((claim) => claim.status === "pending")
          .reduce((sum, claim) => sum + claim.amountWolo, 0),
        claimedCount: allClaims.filter((claim) => claim.status === "claimed").length,
        claimedAmountWolo: allClaims
          .filter((claim) => claim.status === "claimed")
          .reduce((sum, claim) => sum + claim.amountWolo, 0),
        rescindedCount: allClaims.filter((claim) => claim.status === "rescinded").length,
        rescindedAmountWolo: allClaims
          .filter((claim) => claim.status === "rescinded")
          .reduce((sum, claim) => sum + claim.amountWolo, 0),
        autoSettledCount: settlementRows.filter((row) => row.settlementMode === "auto_settled").length,
        autoSettledAmountWolo: settlementRows
          .filter((row) => row.settlementMode === "auto_settled")
          .reduce((sum, row) => sum + row.amountWolo, 0),
        failedCount: settlementRows.filter(
          (row) => Boolean(row.errorState) && !isAwaitingVerifiedWalletLinkDetail(row.errorState)
        ).length,
        failedAmountWolo: settlementRows
          .filter(
            (row) =>
              Boolean(row.errorState) && !isAwaitingVerifiedWalletLinkDetail(row.errorState)
          )
          .reduce((sum, row) => sum + row.amountWolo, 0),
      },
      rows: settlementRows,
    };

    const marketRailRows = marketRows.map((market) => {
      const poolEligibleWagers = market.wagers.filter(
        (wager) => wager.status !== "void" && isCountableWagerRow(wager)
      );
      const leftPoolWolo =
        market.seedLeftWolo +
        poolEligibleWagers
          .filter((wager) => wager.side === "left")
          .reduce((sum, wager) => sum + wager.amountWolo, 0);
      const rightPoolWolo =
        market.seedRightWolo +
        poolEligibleWagers
          .filter((wager) => wager.side === "right")
          .reduce((sum, wager) => sum + wager.amountWolo, 0);

      const unresolvedIntents = market.stakeIntents.map((intent) => ({
        id: intent.id,
        userUid: intent.user.uid,
        displayName: displayUserName(intent.user),
        side: intent.side === "right" ? "right" : "left",
        amountWolo: intent.amountWolo,
        status: intent.status,
        walletAddress: intent.walletAddress ?? null,
        stakeTxHash: intent.stakeTxHash ?? null,
        stakeProofUrl: intent.stakeTxHash ? buildWoloRestTxLookupUrl(intent.stakeTxHash) : null,
        errorDetail: intent.errorDetail ?? null,
        updatedAt: intent.updatedAt.toISOString(),
      }));

      const unresolvedByUserId = new Map<number, typeof unresolvedIntents>();
      for (const intent of unresolvedIntents) {
        const original = market.stakeIntents.find((entry) => entry.id === intent.id);
        if (!original) continue;
        const bucket = unresolvedByUserId.get(original.userId) ?? [];
        bucket.push(intent);
        unresolvedByUserId.set(original.userId, bucket);
      }

      const bettorsBySide = new Map<string, {
        userId: number;
        userUid: string;
        displayName: string;
        side: "left" | "right";
        totalStakeWolo: number;
        slipCount: number;
        executionModes: string[];
        statuses: string[];
        stakeWalletAddress: string | null;
        stakeTxHash: string | null;
        payoutWolo: number;
        payoutTxHash: string | null;
        payoutProofUrl: string | null;
      }>();

      for (const wager of poolEligibleWagers) {
        const side = wager.side === "right" ? "right" : "left";
        const bucketKey = `${wager.userId}:${side}`;
        const existing = bettorsBySide.get(bucketKey);

        if (existing) {
          existing.totalStakeWolo += wager.amountWolo;
          existing.slipCount += 1;
          existing.executionModes.push(wager.executionMode);
          existing.statuses.push(wager.status);
          existing.payoutWolo += wager.payoutWolo ?? 0;
          existing.stakeWalletAddress ||= wager.stakeWalletAddress ?? null;
          existing.stakeTxHash ||= wager.stakeTxHash ?? null;
          existing.payoutTxHash ||= wager.payoutTxHash ?? null;
          existing.payoutProofUrl ||= wager.payoutProofUrl ?? null;
          continue;
        }

        bettorsBySide.set(bucketKey, {
          userId: wager.userId,
          userUid: wager.user.uid,
          displayName: displayUserName(wager.user),
          side,
          totalStakeWolo: wager.amountWolo,
          slipCount: 1,
          executionModes: [wager.executionMode],
          statuses: [wager.status],
          stakeWalletAddress: wager.stakeWalletAddress ?? null,
          stakeTxHash: wager.stakeTxHash ?? null,
          payoutWolo: wager.payoutWolo ?? 0,
          payoutTxHash: wager.payoutTxHash ?? null,
          payoutProofUrl: wager.payoutProofUrl ?? null,
        });
      }

      const leftBettors = Array.from(bettorsBySide.values())
        .filter((bettor) => bettor.side === "left")
        .map((bettor) => {
          const selectedPoolWolo = Math.max(0, leftPoolWolo - bettor.totalStakeWolo);
          const unresolved = unresolvedByUserId.get(bettor.userId) ?? [];

          return {
            userId: bettor.userId,
            userUid: bettor.userUid,
            displayName: bettor.displayName,
            totalStakeWolo: bettor.totalStakeWolo,
            slipCount: bettor.slipCount,
            executionMode: resolveExecutionMode(bettor.executionModes),
            wagerStatus: resolveWagerStatus(bettor.statuses),
            estimatedPayoutWolo: projectReturnWolo(
              bettor.totalStakeWolo,
              selectedPoolWolo,
              rightPoolWolo
            ),
            stakeWalletAddress: bettor.stakeWalletAddress,
            stakeTxHash: bettor.stakeTxHash,
            stakeProofUrl: bettor.stakeTxHash ? buildWoloRestTxLookupUrl(bettor.stakeTxHash) : null,
            payoutWolo: bettor.payoutWolo > 0 ? bettor.payoutWolo : null,
            payoutTxHash: bettor.payoutTxHash,
            payoutProofUrl: bettor.payoutProofUrl,
            recoveryState: resolveRecoveryState(unresolved.map((intent) => intent.status)),
            unresolvedIntentCount: unresolved.length,
          };
        })
        .sort((left, right) => right.totalStakeWolo - left.totalStakeWolo);

      const rightBettors = Array.from(bettorsBySide.values())
        .filter((bettor) => bettor.side === "right")
        .map((bettor) => {
          const selectedPoolWolo = Math.max(0, rightPoolWolo - bettor.totalStakeWolo);
          const unresolved = unresolvedByUserId.get(bettor.userId) ?? [];

          return {
            userId: bettor.userId,
            userUid: bettor.userUid,
            displayName: bettor.displayName,
            totalStakeWolo: bettor.totalStakeWolo,
            slipCount: bettor.slipCount,
            executionMode: resolveExecutionMode(bettor.executionModes),
            wagerStatus: resolveWagerStatus(bettor.statuses),
            estimatedPayoutWolo: projectReturnWolo(
              bettor.totalStakeWolo,
              selectedPoolWolo,
              leftPoolWolo
            ),
            stakeWalletAddress: bettor.stakeWalletAddress,
            stakeTxHash: bettor.stakeTxHash,
            stakeProofUrl: bettor.stakeTxHash ? buildWoloRestTxLookupUrl(bettor.stakeTxHash) : null,
            payoutWolo: bettor.payoutWolo > 0 ? bettor.payoutWolo : null,
            payoutTxHash: bettor.payoutTxHash,
            payoutProofUrl: bettor.payoutProofUrl,
            recoveryState: resolveRecoveryState(unresolved.map((intent) => intent.status)),
            unresolvedIntentCount: unresolved.length,
          };
        })
        .sort((left, right) => right.totalStakeWolo - left.totalStakeWolo);

      return {
        id: market.id,
        title: market.title,
        eventLabel: market.eventLabel,
        status: market.status,
        featured: market.featured,
        leftLabel: market.leftLabel,
        rightLabel: market.rightLabel,
        winnerSide:
          market.winnerSide === "left" || market.winnerSide === "right"
            ? market.winnerSide
            : null,
        leftPoolWolo,
        rightPoolWolo,
        totalPotWolo: leftPoolWolo + rightPoolWolo,
        settlementRunId: market.settlementRunId ?? null,
        settlementStatus: market.settlementStatus ?? null,
        settlementFailureCode: market.settlementFailureCode ?? null,
        settlementDetail: market.settlementDetail ?? null,
        settlementAttemptedAt: market.settlementAttemptedAt?.toISOString() ?? null,
        settlementExecutedAt: market.settlementExecutedAt?.toISOString() ?? null,
        leftBettors,
        rightBettors,
        unresolvedIntents,
      };
    });

    const marketRail = {
      summary: {
        betEscrowMode: escrowRuntime.mode,
        onchainEscrowEnabled: escrowRuntime.onchainAllowed,
        onchainEscrowRequired: escrowRuntime.onchainRequired,
        escrowConfigError: escrowRuntime.configError,
        settlementServiceConfigured: settlementSurface.settlementServiceConfigured,
        settlementAuthConfigured: settlementSurface.settlementAuthConfigured,
        settlementExecutionMode: settlementSurface.payoutExecutionMode,
        groupedRunCapability: settlementSurface.groupedRunCapability,
        escrowVerifyCapability: settlementSurface.escrowVerifyCapability,
        escrowRecentCapability: settlementSurface.escrowRecentCapability,
        settlementSurfaceWarnings: settlementSurface.warnings,
        settlementSurfaceDetail: settlementSurface.detail,
        openCount: marketRailRows.filter((market) =>
          ["open", "closing", "live"].includes(market.status)
        ).length,
        liveCount: marketRailRows.filter((market) => market.status === "live").length,
        pendingSettlementCount: marketRailRows.filter((market) =>
          market.settlementStatus === "pending" || market.settlementStatus === "dry_run"
        ).length,
        failedSettlementCount: marketRailRows.filter((market) =>
          market.settlementStatus === "failed" || market.settlementStatus === "partial"
        ).length,
        unresolvedIntentCount: marketRailRows.reduce(
          (sum, market) => sum + market.unresolvedIntents.length,
          0
        ),
        totalPotWolo: marketRailRows.reduce((sum, market) => sum + market.totalPotWolo, 0),
      },
      rows: marketRailRows,
    };

    const overview = {
      totalUsers: userRows.length,
      activeUsers24h: userRows.filter((user) => {
        if (!user.lastSeen) return false;
        return Date.now() - new Date(user.lastSeen).getTime() <= 24 * 60 * 60 * 1000;
      }).length,
      unreadForAdmin: userRows.reduce((sum, user) => sum + user.unreadCount, 0),
      unreadForUsers: userRows.reduce((sum, user) => sum + user.userUnreadCount, 0),
      pendingHonors: userRows.reduce(
        (sum, user) => sum + user.pendingBadgeCount + user.pendingGiftCount,
        0
      ),
      pendingWoloClaims: userRows.reduce((sum, user) => sum + user.pendingWoloClaimCount, 0),
      pendingWoloClaimAmount: userRows.reduce((sum, user) => sum + user.pendingWoloClaimAmount, 0),
      claimedWoloClaims: userRows.reduce((sum, user) => sum + user.claimedWoloClaimCount, 0),
      claimedWoloClaimAmount: userRows.reduce((sum, user) => sum + user.claimedWoloClaimAmount, 0),
      totalActionEvents: userRows.reduce((sum, user) => sum + user.recentActionsTotalCount, 0),
      themeBreakdown: ["black", "grey", "white", "sepia", "walnut", "crimson", "midnight"].map(
        (themeKey) => ({
          themeKey,
          count: userRows.filter((user) => user.appearance?.themeKey === themeKey).length,
        })
      ),
      viewBreakdown: ["steel", "field"].map((viewMode) => ({
        viewMode,
        count: userRows.filter((user) => user.appearance?.viewMode === viewMode).length,
      })),
    };

    return NextResponse.json({
      users: userRows,
      overview,
      settlementRail,
      marketRail,
      watcherDownloads,
    });
  } catch (err) {
    console.error("Failed to load admin users:", err);
    return NextResponse.json({ detail: "Internal error" }, { status: 500 });
  }
}
