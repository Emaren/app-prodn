import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
    };
    const enabled = payload.enabled !== false;

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true, walletAddress: true },
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const position = await prisma.stakingPosition.upsert({
      where: { userId: viewer.id },
      create: {
        userId: viewer.id,
        walletAddress: viewer.walletAddress,
        autoCompoundRewards: enabled,
      },
      update: {
        autoCompoundRewards: enabled,
        ...(viewer.walletAddress ? { walletAddress: viewer.walletAddress } : {}),
      },
      select: {
        autoCompoundRewards: true,
        compoundedRewardsWolo: true,
      },
    });

    return NextResponse.json({
      ok: true,
      autoCompoundRewards: position.autoCompoundRewards,
      compoundedRewardsWolo: position.compoundedRewardsWolo,
      detail: position.autoCompoundRewards
        ? "Auto-stake rewards is on."
        : "Auto-stake rewards is off. Future rewards will wait for payout.",
    });
  } catch (error) {
    console.error("Failed to update staking auto-compound setting:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not update auto-stake rewards." },
      { status: 500 }
    );
  }
}
