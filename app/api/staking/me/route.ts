import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { loadStakingMe } from "@/lib/staking";
import { loadStakingExecutionLimits } from "@/lib/stakingExecution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const stakingState = await loadStakingMe(prisma, viewer.id);
    const limits = await loadStakingExecutionLimits(
      prisma,
      stakingState.position.currentStakedWolo
    );

    return NextResponse.json({
      ...stakingState,
      execution: {
        ...stakingState.execution,
        ...limits,
        status: "READY",
        detail: limits.balanceLookupError
          ? "Staking ledger ready. Wallet balance lookup pending."
          : "Staking ledger ready.",
      },
    });
  } catch (error) {
    console.error("Failed to load viewer staking state:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not load staking state." },
      { status: 500 }
    );
  }
}
