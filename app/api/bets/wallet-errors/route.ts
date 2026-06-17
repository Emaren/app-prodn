import { NextRequest, NextResponse } from "next/server";

import {
  normalizeBetAmount,
  normalizeBetSide,
} from "@/lib/betWagering";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
  walletAddress: true,
} as const;

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}


function classifyBetWalletIssue(rawError: string) {
  const normalized = rawError.toLowerCase();

  if (
    normalized.includes("keplr extension not found") ||
    normalized.includes("keplr is not available") ||
    normalized.includes("keplr offline signer was not found")
  ) {
    return "keplr_unavailable";
  }

  if (/insufficient|not enough|balance/i.test(rawError)) {
    return "insufficient_mainnet_balance";
  }

  if (/reject|denied|declined|cancel/i.test(rawError)) {
    return "wallet_rejected";
  }

  return "wallet_flow_error";
}

function describeBetWalletIssue(rawError: string) {
  switch (classifyBetWalletIssue(rawError)) {
    case "keplr_unavailable":
      return "Keplr is not available in this browser. No bet was placed and no WOLO moved. Open AoE2WAR in the Chrome profile where Keplr is installed, enable Keplr for aoe2war.com, then try again.";
    case "insufficient_mainnet_balance":
      return "Not enough mainnet WOLO is available in this wallet for that bet. No bet was placed and no WOLO moved.";
    case "wallet_rejected":
      return "Wallet approval was cancelled or rejected. No bet was placed and no WOLO moved.";
    default:
      return rawError;
  }
}

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
      walletAddress?: string;
      walletProvider?: string;
      walletType?: string;
      browserInfo?: string;
      routePath?: string;
      step?: string;
      rawError?: string;
    };

    const marketId =
      typeof payload.marketId === "number"
        ? payload.marketId
        : typeof payload.marketId === "string"
          ? Number.parseInt(payload.marketId, 10)
          : NaN;
    const side = normalizeBetSide(payload.side);
    const amountWolo = normalizeBetAmount(payload.amountWolo);
    const routePath = normalizeText(payload.routePath, 160) || "/bets";
    const rawError =
      normalizeText(payload.rawError, 500) ||
      "Wallet flow failed before the wager was recorded.";
    const step = normalizeText(payload.step, 80) || "wallet_preflight";
    const walletIssue = classifyBetWalletIssue(rawError);
    const friendlyError = describeBetWalletIssue(rawError);

    if (!Number.isFinite(marketId) || !side || !amountWolo) {
      return NextResponse.json(
        { detail: "Market, side, and stake are required." },
        { status: 400 }
      );
    }

    const market = await prisma.betMarket.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        title: true,
        status: true,
        marketType: true,
        leftLabel: true,
        rightLabel: true,
      },
    });

    await recordUserActivity(prisma, {
      userId: viewer.id,
      type: "bet_wallet_error",
      path: routePath,
      label: market?.title || `market ${marketId}`,
      metadata: {
        marketId,
        marketType: market?.marketType ?? null,
        marketStatus: market?.status ?? null,
        side,
        amountWolo,
        leftLabel: market?.leftLabel ?? null,
        rightLabel: market?.rightLabel ?? null,
        walletAddress:
          normalizeText(payload.walletAddress, 100) || viewer.walletAddress || null,
        walletProvider: normalizeText(payload.walletProvider, 32),
        walletType: normalizeText(payload.walletType, 32),
        browserInfo: normalizeText(payload.browserInfo, 255),
        step,
        rawError,
        walletIssue,
        friendlyError,
        preIntent: true,
      },
      dedupeWithinSeconds: 0,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to record bet wallet error:", error);
    const detail =
      error instanceof Error ? error.message : "Could not record wallet error.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
