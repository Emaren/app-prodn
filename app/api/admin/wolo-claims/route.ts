import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { retryPendingClaimSettlement } from "@/lib/adminWoloClaims";
import { hasWoloPayoutExecutionConfigured } from "@/lib/woloBetSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampTake(value: unknown) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) {
    return 25;
  }
  return Math.max(1, Math.min(100, numeric));
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    if (!hasWoloPayoutExecutionConfigured()) {
      return NextResponse.json(
        { detail: "WOLO payout execution is not configured in this environment." },
        { status: 409 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      take?: number;
    };

    if (payload.action !== "reconcile_pending") {
      return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    const take = clampTake(payload.take);
    const pendingClaims = await gate.prisma.pendingWoloClaim.findMany({
      where: { status: "pending" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take,
    });

    let claimedCount = 0;
    let claimedAmountWolo = 0;
    let failedCount = 0;
    let skippedUnmatchedCount = 0;
    let skippedHasTxHashCount = 0;
    const claimedClaimIds: number[] = [];
    const failedClaims: Array<{ claimId: number; detail: string }> = [];

    for (const claim of pendingClaims) {
      const result = await retryPendingClaimSettlement(gate.prisma, claim.id, {
        activityPath: "/admin/user-list",
        memoTag: "admin_reconcile_pending",
      });

      if (result.outcome === "claimed") {
        claimedCount += 1;
        claimedAmountWolo += result.amountWolo;
        claimedClaimIds.push(result.claimId);
        continue;
      }

      if (result.outcome === "failed") {
        failedCount += 1;
        failedClaims.push({
          claimId: result.claimId,
          detail: result.detail,
        });
        continue;
      }

      if (result.reason === "already_has_payout_tx") {
        skippedHasTxHashCount += 1;
        continue;
      }

      if (result.reason === "unmatched_user") {
        skippedUnmatchedCount += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        scannedCount: pendingClaims.length,
        claimedCount,
        claimedAmountWolo,
        failedCount,
        skippedUnmatchedCount,
        skippedHasTxHashCount,
      },
      claimedClaimIds,
      failedClaims: failedClaims.slice(0, 8),
    });
  } catch (error) {
    console.error("Failed to reconcile pending WOLO claims:", error);
    return NextResponse.json({ detail: "Reconcile failed" }, { status: 500 });
  }
}
