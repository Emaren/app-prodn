import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { syncFounderBonusStatus } from "@/lib/betFounderBonuses";
import {
  findMatchedClaimUser,
  retryPendingClaimSettlement,
} from "@/lib/adminWoloClaims";
import {
  hasWoloPayoutExecutionConfigured,
} from "@/lib/woloBetSettlement";
import { rescindPendingWoloClaim } from "@/lib/pendingWoloClaims";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function rescindClaim(
  request: NextRequest,
  claimId: number,
  payloadNote?: string | null
) {
  const gate = await requireAdmin(request);
  if ("error" in gate) {
    return gate.error;
  }

  const { prisma, user: admin } = gate;
  const existingClaim = await prisma.pendingWoloClaim.findUnique({
    where: { id: claimId },
    select: {
      id: true,
      displayPlayerName: true,
      normalizedPlayerName: true,
      amountWolo: true,
      sourceFounderBonusId: true,
    },
  });

  if (!existingClaim) {
    return NextResponse.json({ detail: "Claim not found" }, { status: 404 });
  }

  const claim = await rescindPendingWoloClaim(prisma, {
    claimId,
    adminUserId: admin.id,
    note: payloadNote,
  });

  if (existingClaim.sourceFounderBonusId) {
    await syncFounderBonusStatus(prisma, [existingClaim.sourceFounderBonusId]);
  }

  const matchedUser = await findMatchedClaimUser(prisma, existingClaim);

  if (matchedUser) {
    await recordUserActivity(prisma, {
      userId: matchedUser.id,
      type: "wolo_claim_rescinded",
      path: "/admin/user-list",
      label: claim.displayPlayerName,
      metadata: {
        claimId: claim.id,
        amountWolo: claim.amountWolo,
        note: claim.note,
      },
      dedupeWithinSeconds: 0,
    });
  }

  return NextResponse.json({ ok: true, claimId: claim.id });
}

async function retrySettlementClaim(
  request: NextRequest,
  claimId: number
) {
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

  const { prisma } = gate;
  const result = await retryPendingClaimSettlement(prisma, claimId, {
    activityPath: "/admin/user-list",
    memoTag: "admin_retry_settlement",
  });

  if (result.outcome === "claimed") {
    return NextResponse.json({ ok: true, claimId: result.claimId, txHash: result.txHash });
  }

  if (result.outcome === "failed") {
    return NextResponse.json({ detail: result.detail }, { status: 500 });
  }

  switch (result.reason) {
    case "not_found":
      return NextResponse.json({ detail: "Claim not found" }, { status: 404 });
    case "not_pending":
      return NextResponse.json(
        { detail: "Only pending settlement rows can be retried." },
        { status: 409 }
      );
    case "already_has_payout_tx":
      return NextResponse.json(
        { detail: "This pending row already has a payout tx hash and needs manual review." },
        { status: 409 }
      );
    case "unmatched_user":
      return NextResponse.json(
        { detail: result.detail || "No verified wallet-linked user matches this claim yet." },
        { status: 409 }
      );
    default:
      return NextResponse.json({ detail: "Retry not available for this claim." }, { status: 409 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> }
) {
  try {
    const { claimId: claimIdRaw } = await context.params;
    const claimId = Number.parseInt(claimIdRaw, 10);

    if (!Number.isFinite(claimId)) {
      return NextResponse.json({ detail: "Claim id is required" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      note?: string;
    };

    if (payload.action === "retry_settlement") {
      return retrySettlementClaim(request, claimId);
    }

    if (payload.action !== "rescind") {
      return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    return rescindClaim(request, claimId, typeof payload.note === "string" ? payload.note : null);
  } catch (error) {
    console.error("Failed to update WOLO claim:", error);
    return NextResponse.json({ detail: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> }
) {
  try {
    const { claimId: claimIdRaw } = await context.params;
    const claimId = Number.parseInt(claimIdRaw, 10);

    if (!Number.isFinite(claimId)) {
      return NextResponse.json({ detail: "Claim id is required" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      note?: string;
    };

    return rescindClaim(request, claimId, typeof payload.note === "string" ? payload.note : null);
  } catch (error) {
    console.error("Failed to rescind unmatched WOLO claim:", error);
    return NextResponse.json({ detail: "Update failed" }, { status: 500 });
  }
}
