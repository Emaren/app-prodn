import { NextRequest, NextResponse } from "next/server";

import {
  markBetStakeIntentFailure,
  refreshRecoverableBetStakeIntents,
  updateBetStakeIntentBroadcast,
} from "@/lib/betStakeIntents";
import {
  BetWagerError,
  normalizeBetTxHash,
  placePooledBetWager,
} from "@/lib/betWagering";
import { loadBetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  walletAddress: true,
} as const;

async function requireViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    return { error: NextResponse.json({ detail: "No active session" }, { status: 401 }) };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: VIEWER_SELECT,
  });

  if (!viewer) {
    return { error: NextResponse.json({ detail: "Viewer not found" }, { status: 404 }) };
  }

  return { prisma, viewer };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ intentId: string }> }
) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const { intentId: intentIdRaw } = await context.params;
    const intentId = Number.parseInt(intentIdRaw, 10);
    if (!Number.isFinite(intentId)) {
      return NextResponse.json({ detail: "Intent id is required." }, { status: 400 });
    }

    const intent = await prisma.betStakeIntent.findUnique({
      where: { id: intentId },
      select: {
        id: true,
        marketId: true,
        userId: true,
        side: true,
        amountWolo: true,
        walletAddress: true,
        walletProvider: true,
        walletType: true,
        browserInfo: true,
        routePath: true,
        status: true,
        stakeTxHash: true,
      },
    });

    if (!intent || intent.userId !== viewer.id) {
      return NextResponse.json({ detail: "Stake intent not found." }, { status: 404 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      walletAddress?: string;
      walletProvider?: string;
      walletType?: string;
      browserInfo?: string;
      routePath?: string;
      stakeTxHash?: string;
      step?: string;
      rawError?: string;
      status?: string;
    };

    if (payload.action === "record_broadcast") {
      const stakeTxHash = normalizeBetTxHash(payload.stakeTxHash);
      if (!stakeTxHash) {
        return NextResponse.json({ detail: "Stake tx hash is required." }, { status: 400 });
      }

      await updateBetStakeIntentBroadcast(prisma, {
        intentId,
        stakeTxHash,
        walletAddress: payload.walletAddress ?? intent.walletAddress,
        walletProvider: payload.walletProvider ?? intent.walletProvider,
        walletType: payload.walletType ?? intent.walletType,
        browserInfo: payload.browserInfo ?? intent.browserInfo,
        routePath: payload.routePath ?? intent.routePath,
      });

      return NextResponse.json({ ok: true, intentId, stakeTxHash });
    }

    if (payload.action === "record_failure") {
      const failureStatus =
        payload.status === "suspect" || payload.status === "orphaned"
          ? payload.status
          : "failed";

      await markBetStakeIntentFailure(prisma, {
        intentId,
        status: failureStatus,
        errorDetail: payload.rawError ?? "Wallet flow failed before the wager was recorded.",
      });

      await recordUserActivity(prisma, {
        userId: viewer.id,
        type: "bet_wallet_error",
        path: payload.routePath || intent.routePath || "/bets",
        label: `market ${intent.marketId}`,
        metadata: {
          marketId: intent.marketId,
          intentId,
          walletAddress: payload.walletAddress || intent.walletAddress,
          walletProvider: payload.walletProvider || intent.walletProvider,
          walletType: payload.walletType || intent.walletType,
          browserInfo: payload.browserInfo || intent.browserInfo,
          step: payload.step || "unknown",
          rawError: payload.rawError || null,
          intentStatus: failureStatus,
        },
        dedupeWithinSeconds: 0,
      });

      return NextResponse.json({ ok: true, intentId, status: failureStatus });
    }

    if (payload.action !== "recover") {
      return NextResponse.json({ detail: "Unknown action." }, { status: 400 });
    }

    await refreshRecoverableBetStakeIntents(prisma, viewer.id);
    const refreshedIntent = await prisma.betStakeIntent.findUnique({
      where: { id: intentId },
      select: {
        id: true,
        marketId: true,
        userId: true,
        side: true,
        amountWolo: true,
        walletAddress: true,
        walletProvider: true,
        walletType: true,
        browserInfo: true,
        routePath: true,
        status: true,
        stakeTxHash: true,
      },
    });
    const activeIntent =
      refreshedIntent && refreshedIntent.userId === viewer.id ? refreshedIntent : intent;

    try {
      await placePooledBetWager(prisma, {
        viewer,
        marketId: activeIntent.marketId,
        side: activeIntent.side === "right" ? "right" : "left",
        amountWolo: activeIntent.amountWolo,
        walletAddress: payload.walletAddress ?? activeIntent.walletAddress,
        stakeTxHash: normalizeBetTxHash(payload.stakeTxHash) || activeIntent.stakeTxHash,
        stakeIntentId: activeIntent.id,
      });
    } catch (error) {
      if (error instanceof BetWagerError) {
        await markBetStakeIntentFailure(prisma, {
          intentId,
          status: error.status >= 500 ? "failed" : "suspect",
          errorDetail: error.message,
        });
        return NextResponse.json({ detail: error.message }, { status: error.status });
      }
      throw error;
    }

    const refreshed = await loadBetBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update bet stake intent:", error);
    const detail =
      error instanceof Error ? error.message : "Stake recovery update failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
