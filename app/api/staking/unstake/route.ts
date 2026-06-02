import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { createConfirmedStakingEvent, StakingActionError } from "@/lib/staking";
import {
  getUnstakeReserveCheck,
  loadStakingExecutionLimits,
  STAKING_WALLET_TOP_UP_DETAIL,
} from "@/lib/stakingExecution";
import { loadMainnetStakingPositionForUser } from "@/lib/mainnetStakingPositions";
import {
  readWoloTxNetworkFeeWolo,
  validateWoloAddress,
} from "@/lib/woloBetSettlement";
import { isWoloMainnet } from "@/lib/woloChain";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";
import {
  executeWoloStakingUnstake,
  hasWoloStakingUnstakeExecutionConfigured,
} from "@/lib/woloStakingUnstake";

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

    if (!hasWoloStakingUnstakeExecutionConfigured()) {
      return NextResponse.json(
        { detail: "Staking wallet signer is not configured for unstaking." },
        { status: 409 }
      );
    }

    const currentConfirmedStakeWolo = isWoloMainnet()
      ? (await loadMainnetStakingPositionForUser(prisma, viewer.id))?.currentStakedWolo ?? 0
      : (await prisma.stakingPosition.findUnique({
          where: { userId: viewer.id },
          select: { currentStakedWolo: true },
        }))?.currentStakedWolo ?? 0;

    if (currentConfirmedStakeWolo < amountWolo) {
      return NextResponse.json(
        { detail: "No confirmed stake is available for that unstake." },
        { status: 409 }
      );
    }

    const limits = await loadStakingExecutionLimits(prisma, currentConfirmedStakeWolo);
    if (amountWolo > limits.maxUnstakeWolo) {
      return NextResponse.json(
        {
          detail:
            limits.maxUnstakeWolo > 0
              ? `Max unstake is ${limits.maxUnstakeWolo.toLocaleString()} WOLO right now.`
              : "No confirmed stake is available for that unstake.",
          maxUnstakeWolo: limits.maxUnstakeWolo,
          stakingWalletReserveHeadroomWolo: limits.stakingWalletReserveHeadroomWolo,
          stakingWalletBalanceWolo: limits.stakingWalletBalanceWolo,
        },
        { status: 409 }
      );
    }

    const reserveCheck = getUnstakeReserveCheck(
      limits,
      amountWolo,
      currentConfirmedStakeWolo
    );
    if (!reserveCheck.executable) {
      console.warn("Staking unstake reserve check failed:", reserveCheck);
      return NextResponse.json(
        {
          detail: STAKING_WALLET_TOP_UP_DETAIL,
          reserveCheck,
          maxUnstakeWolo: limits.maxUnstakeWolo,
          stakingWalletBalanceWolo: limits.stakingWalletBalanceWolo,
          stakingWalletReserveHeadroomWolo: limits.stakingWalletReserveHeadroomWolo,
          requiredStakingWalletBalanceWolo: limits.requiredStakingWalletBalanceWolo,
          operatorTopUpNeededWolo: reserveCheck.operatorTopUpNeededWolo,
        },
        { status: 409 }
      );
    }

    const stakingRuntime = getWoloStakingRuntime();
    const unstake = await executeWoloStakingUnstake({
      toAddress: walletAddress,
      amountWolo,
      memo: `AoE2HDBets staking unstake`,
    });
    if (!unstake?.txHash) {
      return NextResponse.json(
        { detail: "WoloChain did not return an unstake tx." },
        { status: 502 }
      );
    }

    const txFeeWolo = await readWoloTxNetworkFeeWolo(unstake.txHash);
    const event = await createConfirmedStakingEvent(prisma, {
      userId: viewer.id,
      walletAddress,
      type: "UNSTAKE",
      amountWolo,
      txHash: unstake.txHash,
      txFeeWolo,
      proofUrl: unstake.proofUrl ?? null,
      metadata: {
        routePath: request.nextUrl.pathname,
        stakingWalletAddress: stakingRuntime.stakingWalletAddress || null,
        unstakeExecutionMode: stakingRuntime.unstakeExecutionMode,
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
    const detail = error instanceof Error ? error.message : "Could not prepare unstake request.";
    if (/staking wallet signer|staking signer|configured staking wallet/i.test(detail)) {
      return NextResponse.json({ detail }, { status: 409 });
    }
    if (/headroom|reserve|top-up|top up|underfunded/i.test(detail)) {
      return NextResponse.json({ detail: STAKING_WALLET_TOP_UP_DETAIL }, { status: 409 });
    }
    console.error("Failed to prepare unstake request:", error);
    return NextResponse.json(
      { detail },
      { status: 500 }
    );
  }
}
