import { NextRequest, NextResponse } from "next/server";

import { createBetStakeIntent } from "@/lib/betStakeIntents";
import {
  BetWagerError,
  normalizeBetAmount,
  normalizeBetSide,
  preflightPooledBetWager,
} from "@/lib/betWagering";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { getWoloBetEscrowRuntime } from "@/lib/woloChain";

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
    const escrowRuntime = getWoloBetEscrowRuntime();

    if (escrowRuntime.onchainRequired && !escrowRuntime.onchainAllowed) {
      return NextResponse.json(
        {
          detail:
            escrowRuntime.configError ||
            "WOLO bet escrow is required here, but the escrow rail is not ready.",
        },
        { status: 503 }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      marketId?: number | string;
      side?: string;
      amountWolo?: number | string;
      walletAddress?: string;
      walletProvider?: string;
      walletType?: string;
      browserInfo?: string;
      routePath?: string;
    };

    const side = normalizeBetSide(payload.side);
    const amountWolo = normalizeBetAmount(payload.amountWolo);
    const marketId =
      typeof payload.marketId === "number"
        ? payload.marketId
        : typeof payload.marketId === "string"
          ? Number.parseInt(payload.marketId, 10)
          : NaN;

    if (!Number.isFinite(marketId) || !side || !amountWolo) {
      return NextResponse.json(
        { detail: "Market, side, and stake are required." },
        { status: 400 }
      );
    }

    const walletAddress =
      typeof payload.walletAddress === "string" && payload.walletAddress.trim()
        ? payload.walletAddress.trim()
        : viewer.walletAddress;

    if (escrowRuntime.onchainAllowed && !walletAddress) {
      return NextResponse.json(
        { detail: "Connect Keplr before preparing a WOLO stake for this market." },
        { status: 409 }
      );
    }

    const market = await prisma.betMarket.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!market) {
      return NextResponse.json({ detail: "Market not found." }, { status: 404 });
    }

    if (!["open", "closing", "live"].includes(market.status)) {
      return NextResponse.json({ detail: "This book is closed." }, { status: 409 });
    }

    try {
      await preflightPooledBetWager(prisma, {
        viewer,
        marketId,
        side,
        walletAddress,
      });
    } catch (error) {
      if (error instanceof BetWagerError) {
        return NextResponse.json({ detail: error.message }, { status: error.status });
      }
      throw error;
    }

    const intent = await createBetStakeIntent(prisma, {
      marketId,
      userId: viewer.id,
      side,
      amountWolo,
      walletAddress,
      walletProvider: payload.walletProvider ?? null,
      walletType: payload.walletType ?? null,
      browserInfo: payload.browserInfo ?? null,
      routePath: payload.routePath ?? request.nextUrl.pathname,
    });

    return NextResponse.json({
      id: intent.id,
      marketId: intent.marketId,
      side: intent.side,
      amountWolo: intent.amountWolo,
      status: intent.status,
    });
  } catch (error) {
    console.error("Failed to create bet stake intent:", error);
    const detail =
      error instanceof Error ? error.message : "Could not create stake intent.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
