import { NextRequest, NextResponse } from "next/server";

import { loadBetBoardSnapshot } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import {
  requiresOnchainStakeProof,
  validateWoloAddress,
  verifyStakeTransfer,
} from "@/lib/woloBetSettlement";

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

function normalizeTxHash(value: string | null | undefined) {
  return (value || "").trim().toUpperCase();
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
      stakeTxHash?: string;
      walletAddress?: string;
    };

    const side = normalizeSide(payload.side);
    const amountWolo = normalizeAmount(payload.amountWolo);
    const marketId = typeof payload.marketId === "number" ? payload.marketId : null;
    const walletAddress = typeof payload.walletAddress === "string" ? payload.walletAddress.trim() : "";
    const stakeTxHash = normalizeTxHash(payload.stakeTxHash);
    const onchainRequired = requiresOnchainStakeProof();

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

    const existingWager = await prisma.betWager.findUnique({
      where: {
        marketId_userId: {
          marketId,
          userId: viewer.id,
        },
      },
      select: {
        id: true,
        side: true,
        amountWolo: true,
        status: true,
        executionMode: true,
        stakeTxHash: true,
        stakeWalletAddress: true,
      },
    });

    if (existingWager && existingWager.status !== "active") {
      return NextResponse.json(
        { detail: "This wager is already settled and cannot be reopened." },
        { status: 409 }
      );
    }

    let resolvedWalletAddress = viewer.walletAddress || null;

    if (onchainRequired) {
      const existingEscrowedSlip =
        existingWager?.status === "active" &&
        existingWager.executionMode === "onchain_escrow" &&
        Boolean(existingWager.stakeTxHash);

      if (existingEscrowedSlip) {
        const isSameEscrowProof =
          existingWager?.side === side &&
          existingWager.amountWolo === amountWolo &&
          existingWager.stakeTxHash === stakeTxHash &&
          (existingWager.stakeWalletAddress || "") === walletAddress;

        if (isSameEscrowProof) {
          const refreshed = await loadBetBoardSnapshot(prisma, viewer.uid);
          return NextResponse.json(refreshed);
        }

        return NextResponse.json(
          { detail: "This slip is already escrowed on-chain and cannot be edited from the app." },
          { status: 409 }
        );
      }

      if (!walletAddress) {
        return NextResponse.json(
          { detail: "Connect Keplr and lock your WOLO stake before recording the wager." },
          { status: 409 }
        );
      }

      const addressError = validateWoloAddress(walletAddress);
      if (addressError) {
        return NextResponse.json({ detail: addressError }, { status: 400 });
      }

      if (!stakeTxHash) {
        return NextResponse.json(
          { detail: "Missing WOLO stake transaction hash for this wager." },
          { status: 409 }
        );
      }

      const duplicateStake = await prisma.betWager.findUnique({
        where: { stakeTxHash },
        select: {
          id: true,
          marketId: true,
          userId: true,
        },
      });

      if (duplicateStake && duplicateStake.id !== existingWager?.id) {
        return NextResponse.json(
          { detail: "That WOLO stake transaction is already attached to another slip." },
          { status: 409 }
        );
      }

      const verification = await verifyStakeTransfer({
        txHash: stakeTxHash,
        fromAddress: walletAddress,
        expectedAmountWolo: amountWolo,
      });

      if (!verification.verified) {
        return NextResponse.json({ detail: verification.detail }, { status: 409 });
      }

      if (viewer.walletAddress !== walletAddress) {
        await prisma.user.update({
          where: { id: viewer.id },
          data: { walletAddress },
        });
      }

      resolvedWalletAddress = walletAddress;
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
        executionMode: onchainRequired ? "onchain_escrow" : "app_only",
        stakeTxHash: onchainRequired ? stakeTxHash : null,
        stakeWalletAddress: onchainRequired ? resolvedWalletAddress : null,
        stakeLockedAt: onchainRequired ? new Date() : null,
      },
      create: {
        marketId,
        userId: viewer.id,
        side,
        amountWolo,
        status: "active",
        executionMode: onchainRequired ? "onchain_escrow" : "app_only",
        stakeTxHash: onchainRequired ? stakeTxHash : null,
        stakeWalletAddress: onchainRequired ? resolvedWalletAddress : null,
        stakeLockedAt: onchainRequired ? new Date() : null,
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
        executionMode: onchainRequired ? "onchain_escrow" : "app_only",
        stakeTxHash: stakeTxHash || null,
        walletAddress: resolvedWalletAddress,
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

    const existingWager = await prisma.betWager.findUnique({
      where: {
        marketId_userId: {
          marketId,
          userId: viewer.id,
        },
      },
      select: {
        id: true,
        executionMode: true,
        stakeTxHash: true,
      },
    });

    if (
      existingWager &&
      (existingWager.executionMode === "onchain_escrow" || Boolean(existingWager.stakeTxHash))
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
        executionMode: existingWager?.executionMode ?? "app_only",
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
