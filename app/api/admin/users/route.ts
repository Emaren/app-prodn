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
    const [communityMap, inbox, appearanceMap, activityMap, adminMemberships, activityStats, allClaims, scheduledRows, wagerRows] = await Promise.all([
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
    });
  } catch (err) {
    console.error("Failed to load admin users:", err);
    return NextResponse.json({ detail: "Internal error" }, { status: 500 });
  }
}
