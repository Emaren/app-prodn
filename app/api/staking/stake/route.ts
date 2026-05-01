import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { createConfirmedStakingEvent, StakingActionError } from "@/lib/staking";
import { validateWoloAddress, verifyWoloTransfer } from "@/lib/woloBetSettlement";
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
      txHash?: string;
      txFeeWolo?: number;
    };
    const amountWolo = normalizeWholeWolo(payload.amountWolo);
    if (!amountWolo || amountWolo <= 0) {
      return NextResponse.json({ detail: "Enter a stake amount in whole WOLO." }, { status: 400 });
    }

    const txHash = payload.txHash?.trim().toUpperCase() || "";
    if (!txHash) {
      return NextResponse.json(
        { detail: "Stake requires a signed Keplr tx." },
        { status: 400 }
      );
    }

    const stakingRuntime = getWoloStakingRuntime();
    if (!stakingRuntime.stakeReady || !stakingRuntime.stakingWalletAddress) {
      return NextResponse.json(
        { detail: "Staking wallet is not configured." },
        { status: 409 }
      );
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
    if (!walletAddress) {
      return NextResponse.json(
        { detail: "Connect a WOLO wallet before preparing a staking request." },
        { status: 409 }
      );
    }

    const addressError = validateWoloAddress(walletAddress);
    if (addressError) {
      return NextResponse.json({ detail: addressError }, { status: 400 });
    }

    const verification = await verifyWoloTransfer({
      txHash,
      fromAddress: walletAddress,
      toAddress: stakingRuntime.stakingWalletAddress,
      expectedAmountWolo: amountWolo,
    });
    if (!verification.verified) {
      return NextResponse.json({ detail: verification.detail }, { status: 409 });
    }

    const event = await createConfirmedStakingEvent(prisma, {
      userId: viewer.id,
      walletAddress,
      type: "STAKE",
      amountWolo,
      txHash: verification.txHash || txHash,
      txFeeWolo: verification.txFeeWolo ?? payload.txFeeWolo ?? 0,
      proofUrl: verification.proofUrl ?? null,
      metadata: {
        routePath: request.nextUrl.pathname,
        stakingWalletAddress: stakingRuntime.stakingWalletAddress,
      },
    });

    return NextResponse.json(
      {
        id: event.id,
        type: event.type,
        amountWolo: event.amountWolo,
        status: event.status,
        txHash: event.txHash,
        txFeeWolo: verification.txFeeWolo ?? payload.txFeeWolo ?? 0,
        detail: "Stake confirmed on WoloChain.",
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof StakingActionError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    console.error("Failed to prepare stake request:", error);
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Could not prepare stake request." },
      { status: 500 }
    );
  }
}
