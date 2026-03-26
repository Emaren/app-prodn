import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@/lib/generated/prisma";

import { loadUserCommunitySummaries } from "@/lib/communityHonors";
import { loadInboxPayload } from "@/lib/contactInbox";
import { requireAdmin } from "@/lib/adminSession";
import {
  loadAppearancePreferenceMap,
  loadRecentActivityMap,
} from "@/lib/userExperience";

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
    const [communityMap, inbox, appearanceMap, activityMap, adminMemberships] = await Promise.all([
      loadUserCommunitySummaries(prisma, userIds, { includePending: true }),
      loadInboxPayload(prisma, admin.uid, { summaryOnly: true }),
      loadAppearancePreferenceMap(prisma, userIds),
      loadRecentActivityMap(prisma, userIds, 6),
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

        const userUnreadCount =
          entry.id === admin.id
            ? 0
            : await loadUserUnreadFromAdminCount(
                prisma,
                admin.id,
                entry.id,
                conversation?.targetLastReadAt ?? null
              );

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
          pendingBadgeCount: community.badges.filter((badge) => badge.status === "pending").length,
          pendingGiftCount: community.gifts.filter((gift) => gift.status === "pending").length,
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
