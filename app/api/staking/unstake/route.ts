import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { createConfirmedStakingEvent, StakingActionError } from "@/lib/staking";
import {
  executeWoloPayout,
  hasWoloPayoutExecutionConfigured,
  readWoloTxNetworkFeeWolo,
  validateWoloAddress,
} from "@/lib/woloBetSettlement";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

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

    if (!walletAddress) {
      return NextResponse.json(
        { detail: "Connect a WOLO wallet before unstaking." },
        { status: 409 }
      );
    }

    if (!hasWoloPayoutExecutionConfigured()) {
      return NextResponse.json(
        { detail: "WoloChain payout execution is not configured for unstaking." },
        { status: 409 }
      );
    }

    const position = await prisma.stakingPosition.findUnique({
      where: { userId: viewer.id },
      select: { currentStakedWolo: true },
    });
    if (!position || position.currentStakedWolo < amountWolo) {
      return NextResponse.json(
        { detail: "No confirmed stake is available for that unstake." },
        { status: 409 }
      );
    }

    const stakingRuntime = getWoloStakingRuntime();
    const requestId = `aoe2hdbets-staking-unstake-${viewer.id}-${Date.now()}`;
    const payout = await executeWoloPayout({
      requestId,
      toAddress: walletAddress,
      amountWolo,
      memo: `AoE2HDBets staking unstake`,
    });
    if (!payout?.txHash) {
      return NextResponse.json(
        { detail: "WoloChain did not return an unstake tx." },
        { status: 502 }
      );
    }

    const txFeeWolo = await readWoloTxNetworkFeeWolo(payout.txHash);
    const event = await createConfirmedStakingEvent(prisma, {
      userId: viewer.id,
      walletAddress,
      type: "UNSTAKE",
      amountWolo,
      txHash: payout.txHash,
      txFeeWolo,
      proofUrl: payout.proofUrl ?? null,
      metadata: {
        routePath: request.nextUrl.pathname,
        requestId: payout.requestId ?? requestId,
        stakingWalletAddress: stakingRuntime.stakingWalletAddress || null,
      },
    });

    return NextResponse.json(
      {
        id: event.id,
        type: event.type,
        amountWolo: event.amountWolo,
        status: event.status,
        txHash: event.txHash,
        txFeeWolo: txFeeWolo ?? 0,
        detail: "Unstake confirmed on WoloChain.",
      },
      { status: 200 }
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
