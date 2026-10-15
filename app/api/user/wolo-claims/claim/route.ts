import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  claimPendingWoloClaimsForUser,
  loadPendingWoloClaimSummaryForUser,
} from "@/lib/pendingWoloClaims";
import { getSessionUid } from "@/lib/session";

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

    // User-facing intent cannot finalize a financial claim. A payout can
    // only become 'claimed' after independent chain-proof verification in the
    // protected settlement rail. No app entitlement is consumed here.
    if (result.requiresSettlement) {
      return NextResponse.json(
        {
          code: "CHAIN_SETTLEMENT_REQUIRED",
          detail: "Your WOLO entitlement is still pending. Claiming requires a verified on-chain payout; nothing has been marked paid or deducted.",
          pendingClaimAmountWolo: summary.pendingAmountWolo,
          pendingClaimCount: summary.pendingCount,
          pendingClaimLatestCreatedAt: summary.latestCreatedAt,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json({
      ok: true,
      detail: "No verified pending WOLO payout is ready on this profile.",
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
