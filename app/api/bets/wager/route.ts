import { NextRequest, NextResponse } from "next/server";

import { loadBetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
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

function normalizeSide(value: unknown) {
  return value === "right" ? "right" : value === "left" ? "left" : null;
}

function normalizePlayerKey(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase();
}

function resolveViewerMatchSide(
  viewer: { inGameName: string | null; steamPersonaName: string | null },
  market: { leftLabel: string; rightLabel: string }
) {
  const viewerKeys = [viewer.inGameName, viewer.steamPersonaName]
    .map((value) => normalizePlayerKey(value))
    .filter(Boolean);
  const leftKey = normalizePlayerKey(market.leftLabel);
  const rightKey = normalizePlayerKey(market.rightLabel);

  const matchesLeft = leftKey && viewerKeys.includes(leftKey);
  const matchesRight = rightKey && viewerKeys.includes(rightKey);

  if (matchesLeft && !matchesRight) return "left" as const;
  if (matchesRight && !matchesLeft) return "right" as const;
  return null;
}

function normalizeAmount(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 1 || rounded > 50_000) return null;
  return rounded;
}

export async function POST(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as {
      marketId?: number;
      side?: string;
      amountWolo?: number;
    };

    const side = normalizeSide(payload.side);
    const amountWolo = normalizeAmount(payload.amountWolo);
    const marketId = typeof payload.marketId === "number" ? payload.marketId : null;

    if (!marketId || !side || !amountWolo) {
      return NextResponse.json({ detail: "Market, side, and stake are required." }, { status: 400 });
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
      return NextResponse.json({ detail: "This book is closed." }, { status: 409 });
    }

    const forcedSide = resolveViewerMatchSide(viewer, market);
    if (forcedSide && side !== forcedSide) {
      const forcedLabel = forcedSide === "left" ? market.leftLabel : market.rightLabel;
      return NextResponse.json(
        { detail: `You can only back yourself in matches you are playing. Lock ${forcedLabel}.` },
        { status: 409 }
      );
    }

    await prisma.betWager.upsert({
      where: {
        marketId_userId: {
          marketId,
          userId: viewer.id,
        },
      },
      update: {
        side,
        amountWolo,
        status: "active",
      },
      create: {
        marketId,
        userId: viewer.id,
        side,
        amountWolo,
        status: "active",
      },
    });

    await recordUserActivity(prisma, {
      userId: viewer.id,
      type: "bet_wager_placed",
      path: "/bets",
      label: market.title,
      metadata: {
        marketId: market.id,
        marketType: market.marketType,
        side,
        amountWolo,
        leftLabel: market.leftLabel,
        rightLabel: market.rightLabel,
        status: market.status,
        forcedSide,
      },
      dedupeWithinSeconds: 5,
    });

    const refreshed = await loadBetBoardSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to place wager:", error);
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

    await prisma.betWager.deleteMany({
      where: {
        marketId,
        userId: viewer.id,
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
