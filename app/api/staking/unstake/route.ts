import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { createPendingStakingEvent, StakingActionError } from "@/lib/staking";
import { validateWoloAddress } from "@/lib/woloBetSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeWholeWolo(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed)) return parsed;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      amountWolo?: number | string;
      walletAddress?: string;
    };
    const amountWolo = normalizeWholeWolo(payload.amountWolo);
    if (!amountWolo || amountWolo <= 0) {
      return NextResponse.json({ detail: "Enter an unstake amount in whole WOLO." }, { status: 400 });
    }

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true, walletAddress: true },
    });
    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const walletAddress = payload.walletAddress?.trim() || viewer.walletAddress;
    if (walletAddress) {
      const addressError = validateWoloAddress(walletAddress);
      if (addressError) {
        return NextResponse.json({ detail: addressError }, { status: 400 });
      }
    }

    const event = await createPendingStakingEvent(prisma, {
      userId: viewer.id,
      walletAddress,
      type: "UNSTAKE",
      amountWolo,
      metadata: { routePath: request.nextUrl.pathname },
    });

    return NextResponse.json(
      {
        id: event.id,
        type: event.type,
        amountWolo: event.amountWolo,
        status: event.status,
        executionPending: true,
        detail: "Staking ledger ready. Chain execution pending.",
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof StakingActionError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    console.error("Failed to prepare unstake request:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not prepare unstake request." },
      { status: 500 }
    );
  }
}
