import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@/lib/generated/prisma";

import type { AdminUsersLivePayload } from "@/components/admin/command-tower/types";
import { requireAdmin } from "@/lib/adminSession";
import { loadUserCommunitySummaries } from "@/lib/communityHonors";
import { loadInboxPayload } from "@/lib/contactInbox";
import {
  loadAppearancePreferenceMap,
  loadRecentActivityMap,
} from "@/lib/userExperience";
import {
  loadPendingWoloClaimsForAdmin,
  normalizePendingWoloClaimName,
} from "@/lib/pendingWoloClaims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        inGameName: true,
        steamPersonaName: true,
        lastSeen: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const userIds = users.map((entry) => entry.id);

    const [
      communityMap,
      inbox,
      appearanceMap,
      activityMap,
      adminMemberships,
      activityStats,
      allClaims,
    ] = await Promise.all([
      loadUserCommunitySummaries(prisma, userIds, { includePending: true }),
      loadInboxPayload(prisma, admin.uid, { summaryOnly: true }),
      loadAppearancePreferenceMap(prisma, userIds),
      loadRecentActivityMap(prisma, userIds, 8),
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
    ]);

    const unreadMap = new Map(
      inbox.summaries.map((summary) => [summary.targetUid, summary.unreadCount] as const)
    );
    const adminConversationMap = new Map<
      number,
      {
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

    const claimsByName = new Map<
      string,
      Array<{
        id: number;
        amountWolo: number;
        status: string;
      }>
    >();
    const claimedClaimTotalsByUserId = new Map<number, { count: number; amount: number }>();

    for (const claim of allClaims) {
      if (!claimsByName.has(claim.normalizedPlayerName)) {
        claimsByName.set(claim.normalizedPlayerName, []);
      }
      claimsByName.get(claim.normalizedPlayerName)!.push({
        id: claim.id,
        amountWolo: claim.amountWolo,
        status: claim.status,
      });

      if (claim.claimedByUserId) {
        const current = claimedClaimTotalsByUserId.get(claim.claimedByUserId) ?? {
          count: 0,
          amount: 0,
        };
        current.count += 1;
        current.amount += claim.amountWolo;
        claimedClaimTotalsByUserId.set(claim.claimedByUserId, current);
      }
    }

    const rows = await Promise.all(
      users.map(async (entry) => {
        const community = communityMap.get(entry.id) ?? {
          badges: [],
          gifts: [],
          giftedWolo: 0,
        };
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

        let pendingWoloClaimCount = 0;
        let pendingWoloClaimAmount = 0;

        for (const key of userNameKeys(entry)) {
          const claimRows = claimsByName.get(key) ?? [];
          for (const claim of claimRows) {
            if (claim.status !== "pending") {
              continue;
            }
            pendingWoloClaimCount += 1;
            pendingWoloClaimAmount += claim.amountWolo;
          }
        }

        const claimedTotals = claimedClaimTotalsByUserId.get(entry.id) ?? {
          count: 0,
          amount: 0,
        };

        return {
          uid: entry.uid,
          displayName: entry.inGameName || entry.steamPersonaName || entry.uid,
          lastSeen: entry.lastSeen ? entry.lastSeen.toISOString() : null,
          unreadCount: unreadMap.get(entry.uid) ?? 0,
          userUnreadCount,
          lastInboxReadAt: conversation?.targetLastReadAt?.toISOString() ?? null,
          adminLastInboxReadAt: conversation?.adminLastReadAt?.toISOString() ?? null,
          recentActions,
          recentActionsTotalCount: activitySummary.recentActionsTotalCount,
          lastActivityAt: activitySummary.lastActivityAt,
          pendingBadgeCount: community.badges.filter((badge) => badge.status === "pending").length,
          pendingGiftCount: community.gifts.filter((gift) => gift.status === "pending").length,
          pendingWoloClaimCount,
          pendingWoloClaimAmount,
          giftedWolo: community.giftedWolo,
          claimedWoloClaimCount: claimedTotals.count,
          claimedWoloClaimAmount: claimedTotals.amount,
          appearance: appearanceMap.get(entry.id) ?? null,
        };
      })
    );

    const payload: AdminUsersLivePayload = {
      overview: {
        totalUsers: rows.length,
        activeUsers24h: rows.filter((user) => {
          if (!user.lastSeen) return false;
          return Date.now() - new Date(user.lastSeen).getTime() <= 24 * 60 * 60 * 1000;
        }).length,
        unreadForAdmin: rows.reduce((sum, user) => sum + user.unreadCount, 0),
        unreadForUsers: rows.reduce((sum, user) => sum + user.userUnreadCount, 0),
        pendingHonors: rows.reduce(
          (sum, user) => sum + user.pendingBadgeCount + user.pendingGiftCount,
          0
        ),
        pendingWoloClaims: rows.reduce((sum, user) => sum + user.pendingWoloClaimCount, 0),
        pendingWoloClaimAmount: rows.reduce(
          (sum, user) => sum + user.pendingWoloClaimAmount,
          0
        ),
        claimedWoloClaims: rows.reduce(
          (sum, user) => sum + user.claimedWoloClaimCount,
          0
        ),
        claimedWoloClaimAmount: rows.reduce(
          (sum, user) => sum + user.claimedWoloClaimAmount,
          0
        ),
        totalActionEvents: rows.reduce(
          (sum, user) => sum + user.recentActionsTotalCount,
          0
        ),
        themeBreakdown: ["black", "grey", "white", "sepia", "walnut", "crimson", "midnight"].map(
          (themeKey) => ({
            themeKey,
            count: rows.filter((user) => user.appearance?.themeKey === themeKey).length,
          })
        ),
        viewBreakdown: ["steel", "field"].map((viewMode) => ({
          viewMode,
          count: rows.filter((user) => user.appearance?.viewMode === viewMode).length,
        })),
      },
      users: rows.map((row) => ({
        uid: row.uid,
        displayName: row.displayName,
        lastSeen: row.lastSeen,
        unreadCount: row.unreadCount,
        userUnreadCount: row.userUnreadCount,
        lastInboxReadAt: row.lastInboxReadAt,
        adminLastInboxReadAt: row.adminLastInboxReadAt,
        recentActions: row.recentActions,
        recentActionsTotalCount: row.recentActionsTotalCount,
        lastActivityAt: row.lastActivityAt,
        pendingBadgeCount: row.pendingBadgeCount,
        pendingGiftCount: row.pendingGiftCount,
        pendingWoloClaimCount: row.pendingWoloClaimCount,
        pendingWoloClaimAmount: row.pendingWoloClaimAmount,
        giftedWolo: row.giftedWolo,
      })),
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load admin user live data:", error);
    return NextResponse.json({ detail: "Live admin data unavailable" }, { status: 500 });
  }
}
