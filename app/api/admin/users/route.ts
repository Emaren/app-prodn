import { NextRequest, NextResponse } from "next/server";
import { loadUserCommunitySummaries } from "@/lib/communityHonors";
import { loadInboxPayload } from "@/lib/contactInbox";
import { requireAdmin } from "@/lib/adminSession";

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

    const communityMap = await loadUserCommunitySummaries(
      prisma,
      users.map((entry) => entry.id)
    );
    const inbox = await loadInboxPayload(prisma, admin.uid, { summaryOnly: true });
    const unreadMap = new Map(
      inbox.summaries.map((summary) => [summary.targetUid, summary.unreadCount] as const)
    );

    return NextResponse.json(
      users.map((entry) => {
        const community = communityMap.get(entry.id) ?? {
          badges: [],
          gifts: [],
          giftedWolo: 0,
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
          gifts: community.gifts.slice(0, 6),
          unreadCount: unreadMap.get(entry.uid) ?? 0,
        };
      })
    );
  } catch (err) {
    console.error("Failed to load admin users:", err);
    return NextResponse.json({ detail: "Internal error" }, { status: 500 });
  }
}
