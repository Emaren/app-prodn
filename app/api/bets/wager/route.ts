import { NextRequest, NextResponse } from "next/server";

import { loadBetBoardSnapshot } from "@/lib/bets";
import {
  BetWagerError,
  normalizeBetAmount,
  normalizeBetSide,
  normalizeBetTxHash,
  placePooledBetWager,
} from "@/lib/betWagering";
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

export async function POST(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as {
      marketId?: number | string;
      side?: string;
      amountWolo?: number | string;
      stakeTxHash?: string;
      walletAddress?: string;
      intentId?: number | string;
    };

    const side = normalizeBetSide(payload.side);
    const amountWolo = normalizeBetAmount(payload.amountWolo);
    const marketId =
      typeof payload.marketId === "number"
        ? payload.marketId
        : typeof payload.marketId === "string"
          ? Number.parseInt(payload.marketId, 10)
          : NaN;
    const intentId =
      typeof payload.intentId === "number"
        ? payload.intentId
        : typeof payload.intentId === "string"
          ? Number.parseInt(payload.intentId, 10)
          : null;

    if (!Number.isFinite(marketId) || !side || !amountWolo) {
      return NextResponse.json(
        { detail: "Market, side, and stake are required." },
        { status: 400 }
      );
    }

    const result = await placePooledBetWager(prisma, {
      viewer,
      marketId,
      side,
      amountWolo,
      walletAddress: typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : null,
      stakeTxHash: normalizeBetTxHash(payload.stakeTxHash),
      stakeIntentId: typeof intentId === "number" && Number.isFinite(intentId) ? intentId : null,
    });

    const refreshed = await loadBetBoardSnapshot(prisma, viewer.uid);
    if (result.kind === "duplicate_existing") {
      return NextResponse.json(refreshed);
    }

    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to place wager:", error);
    if (error instanceof BetWagerError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    const detail = error instanceof Error ? error.message : "Wager failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const marketId = Number.parseInt(request.nextUrl.searchParams.get("marketId") || "", 10);

    if (!Number.isFinite(marketId)) {
      return NextResponse.json({ detail: "Market id is required." }, { status: 400 });
    }

    const market = await prisma.betMarket.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        status: true,
        title: true,
        leftLabel: true,
        rightLabel: true,
        marketType: true,
      },
    });

    if (!market) {
      return NextResponse.json({ detail: "Market not found." }, { status: 404 });
    }

    if (!["open", "closing", "live"].includes(market.status)) {
      return NextResponse.json({ detail: "This book is already closed." }, { status: 409 });
    }

    const activeWagers = await prisma.betWager.findMany({
      where: {
        marketId,
        userId: viewer.id,
        status: "active",
      },
      select: {
        id: true,
        executionMode: true,
        stakeTxHash: true,
        amountWolo: true,
      },
    });

    if (
      activeWagers.some(
        (wager) =>
          wager.executionMode === "onchain_escrow" || Boolean(wager.stakeTxHash)
      )
    ) {
      return NextResponse.json(
        { detail: "On-chain slips cannot be cleared from the app once WOLO has been escrowed." },
        { status: 409 }
      );
    }

    await prisma.betWager.deleteMany({
      where: {
        marketId,
        userId: viewer.id,
        status: "active",
      },
    });

    await recordUserActivity(prisma, {
      userId: viewer.id,
      type: "bet_wager_cancelled",
      path: "/bets",
      label: market.title,
      metadata: {
        marketId: market.id,
        marketType: market.marketType,
        leftLabel: market.leftLabel,
        rightLabel: market.rightLabel,
        status: market.status,
        clearedSlipCount: activeWagers.length,
        clearedWolo: activeWagers.reduce((sum, wager) => sum + wager.amountWolo, 0),
      },
      dedupeWithinSeconds: 5,
    });

    const refreshed = await loadBetBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to cancel wager:", error);
    const detail = error instanceof Error ? error.message : "Cancel failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
