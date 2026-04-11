import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  claimPendingWoloClaimsForUser,
  loadPendingWoloClaimSummaryForUser,
} from "@/lib/pendingWoloClaims";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    if (!user) {
      return NextResponse.json({ detail: "User not found" }, { status: 404 });
    }

    const result = await claimPendingWoloClaimsForUser(prisma, user);
    const summary = await loadPendingWoloClaimSummaryForUser(prisma, user);

    if (result.claimedCount > 0) {
      await recordUserActivity(prisma, {
        userId: user.id,
        type: "wolo_claim_manual",
        path: request.nextUrl.pathname,
        label: `${result.claimedCount} claims`,
        metadata: {
          claimIds: result.claimIds,
          claimedAmountWolo: result.claimedAmountWolo,
        },
        dedupeWithinSeconds: 0,
      });
    }

    return NextResponse.json({
      ok: true,
      claimedCount: result.claimedCount,
      claimedAmountWolo: result.claimedAmountWolo,
      pendingClaimAmountWolo: summary.pendingAmountWolo,
      pendingClaimCount: summary.pendingCount,
      pendingClaimLatestCreatedAt: summary.latestCreatedAt,
    });
  } catch (error) {
    console.error("Failed to claim pending WOLO:", error);
    return NextResponse.json({ detail: "WOLO claim failed" }, { status: 500 });
  }
}
