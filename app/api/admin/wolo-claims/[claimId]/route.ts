import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/adminSession";
import { rescindPendingWoloClaim } from "@/lib/pendingWoloClaims";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ claimId: string }> }
) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { prisma, user: admin } = gate;
    const { claimId: claimIdRaw } = await context.params;
    const claimId = Number.parseInt(claimIdRaw, 10);

    if (!Number.isFinite(claimId)) {
      return NextResponse.json({ detail: "Claim id is required" }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      note?: string;
    };

    if (payload.action !== "rescind") {
      return NextResponse.json({ detail: "Unknown action" }, { status: 400 });
    }

    const existingClaim = await prisma.pendingWoloClaim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        displayPlayerName: true,
        normalizedPlayerName: true,
        amountWolo: true,
      },
    });

    if (!existingClaim) {
      return NextResponse.json({ detail: "Claim not found" }, { status: 404 });
    }

    const claim = await rescindPendingWoloClaim(prisma, {
      claimId,
      adminUserId: admin.id,
      note: typeof payload.note === "string" ? payload.note : null,
    });

    const users = await prisma.user.findMany({
      where: {
        OR: [{ inGameName: { not: null } }, { steamPersonaName: { not: null } }],
      },
      select: {
        id: true,
        inGameName: true,
        steamPersonaName: true,
      },
      take: 250,
    });

    const claimKey = normalizePublicPlayerName(existingClaim.displayPlayerName).toLowerCase();
    const matchedUser =
      users.find((user) =>
        [user.inGameName, user.steamPersonaName]
          .map((value) => normalizePublicPlayerName(value).toLowerCase())
          .filter(Boolean)
          .includes(claimKey)
      ) || null;

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
  } catch (error) {
    console.error("Failed to rescind unmatched WOLO claim:", error);
    return NextResponse.json({ detail: "Update failed" }, { status: 500 });
  }
}
