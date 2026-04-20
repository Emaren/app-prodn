import { NextRequest, NextResponse } from "next/server";

import type {
  WoloChainAdminBalance,
  WoloChainAdminChallengeRun,
  WoloChainAdminPayload,
} from "@/lib/adminWoloChainTypes";
import { requireAdmin } from "@/lib/adminSession";
import { buildChallengeEconomySurface } from "@/lib/challengeEconomy";
import { fetchWoloBalanceAmount, fetchWoloStatusSnapshot } from "@/lib/woloRuntime";
import { formatWoloAmount, getWoloBetEscrowRuntime } from "@/lib/woloChain";
import {
  getWoloPayoutSignerRuntime,
  getWoloSettlementSurfaceStatus,
} from "@/lib/woloBetSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

function displayUserName(entry: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return entry.inGameName || entry.steamPersonaName || entry.uid || "Unknown player";
}

function getCommunityTreasuryAddress() {
  return (
    process.env.WOLO_COMMUNITY_TREASURY_ADDRESS?.trim() ||
    process.env.WOLO_TREASURY_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY_ADDRESS?.trim() ||
    null
  );
}

async function loadBalance(
  key: WoloChainAdminBalance["key"],
  label: string,
  address: string | null,
  missingDetail: string
): Promise<WoloChainAdminBalance> {
  if (!address) {
    return {
      key,
      label,
      address: null,
      amountUWolo: null,
      amountWolo: null,
      status: "missing",
      detail: missingDetail,
    };
  }

  try {
    const amountUWolo = await fetchWoloBalanceAmount(address);
    return {
      key,
      label,
      address,
      amountUWolo,
      amountWolo: `${formatWoloAmount(amountUWolo)} WOLO`,
      status: "ready",
      detail: null,
    };
  } catch (error) {
    return {
      key,
      label,
      address,
      amountUWolo: null,
      amountWolo: null,
      status: "error",
      detail: error instanceof Error ? error.message : "Balance lookup failed.",
    };
  }
}

function toChallengeRun(row: {
  id: number;
  status: string;
  scheduledAt: Date;
  challengeNote: string | null;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  challengerFundingTxHash: string | null;
  challengerFundingWalletAddress: string | null;
  challengerFundedAt: Date | null;
  challengedFundingTxHash: string | null;
  challengedFundingWalletAddress: string | null;
  challengedFundedAt: Date | null;
  challengerCheckedInAt: Date | null;
  challengedCheckedInAt: Date | null;
  liveConfirmedAt: Date | null;
  resultAt: Date | null;
  settlementReadyAt: Date | null;
  linkedSessionKey: string | null;
  linkedMapName: string | null;
  linkedWinner: string | null;
  updatedAt: Date;
  challenger: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  };
  challenged: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  };
}): WoloChainAdminChallengeRun {
  const surface = buildChallengeEconomySurface(row);
  const challengerName = displayUserName(row.challenger);
  const challengedName = displayUserName(row.challenged);

  return {
    id: row.id,
    title: `${challengerName} vs ${challengedName}`,
    status: row.status,
    displayState: surface.displayState,
    statusLabel: surface.economy.statusLabel,
    statusDetail: surface.economy.statusDetail,
    challengerName,
    challengedName,
    scheduledAt: row.scheduledAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resultAt: row.resultAt?.toISOString() ?? null,
    settlementReadyAt: surface.economy.settlementReadyAt,
    terms: {
      wagerAmountWolo: surface.economy.wagerAmountWolo,
      guaranteeAmountWolo: surface.economy.guaranteeAmountWolo,
      totalFundingWolo: surface.economy.totalFundingWolo,
    },
    funding: {
      challengerFundedAt: surface.economy.creatorFundedAt,
      challengedFundedAt: surface.economy.opponentFundedAt,
      challengerFundingTxHash: surface.economy.creatorFundingTxHash,
      challengedFundingTxHash: surface.economy.opponentFundingTxHash,
    },
    checkIn: {
      challengerCheckedInAt: surface.economy.leftCheckedInAt,
      challengedCheckedInAt: surface.economy.rightCheckedInAt,
      opensAt: surface.economy.checkInOpensAt,
      closesAt: surface.economy.checkInClosesAt,
      state: surface.economy.checkInWindowState,
    },
    disposition: surface.economy.resolution,
    linked: {
      sessionKey: row.linkedSessionKey ?? null,
      mapName: row.linkedMapName ?? null,
      winner: row.linkedWinner ?? null,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin(request);
    if ("error" in gate) {
      return gate.error;
    }

    const { prisma } = gate;
    const escrowRuntime = getWoloBetEscrowRuntime();
    const payoutSignerRuntime = getWoloPayoutSignerRuntime();
    const treasuryAddress = getCommunityTreasuryAddress();

    const [chain, settlementService, balances, challengeRows] = await Promise.all([
      fetchWoloStatusSnapshot(),
      getWoloSettlementSurfaceStatus(),
      Promise.all([
        loadBalance(
          "escrow",
          "Escrow balance",
          escrowRuntime.escrowAddress,
          "WOLO_BET_ESCROW_ADDRESS is not configured."
        ),
        loadBalance(
          "payoutSigner",
          "Payout signer balance",
          payoutSignerRuntime.payoutAddress,
          "WOLO_BET_PAYOUT_ADDRESS is not configured."
        ),
        loadBalance(
          "treasury",
          "Treasury balance",
          treasuryAddress,
          "WOLO_COMMUNITY_TREASURY_ADDRESS is not configured."
        ),
      ]),
      prisma.scheduledMatch.findMany({
        where: {
          OR: [
            { settlementReadyAt: { not: null } },
            { resultAt: { not: null } },
            { wagerAmountWolo: { gt: 0 } },
            { guaranteeAmountWolo: { gt: 0 } },
            {
              status: {
                in: [
                  "funded",
                  "ready",
                  "live_confirmed",
                  "completed",
                  "no_show_left",
                  "no_show_right",
                  "double_no_show",
                  "refunded",
                ],
              },
            },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 18,
        select: {
          id: true,
          status: true,
          scheduledAt: true,
          challengeNote: true,
          wagerAmountWolo: true,
          guaranteeAmountWolo: true,
          acceptedAt: true,
          declinedAt: true,
          cancelledAt: true,
          challengerFundingTxHash: true,
          challengerFundingWalletAddress: true,
          challengerFundedAt: true,
          challengedFundingTxHash: true,
          challengedFundingWalletAddress: true,
          challengedFundedAt: true,
          challengerCheckedInAt: true,
          challengedCheckedInAt: true,
          liveConfirmedAt: true,
          resultAt: true,
          settlementReadyAt: true,
          linkedSessionKey: true,
          linkedMapName: true,
          linkedWinner: true,
          updatedAt: true,
          challenger: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
          challenged: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      }),
    ]);

    const [escrow, payoutSigner, treasury] = balances;
    const balanceWarnings = balances
      .filter((balance) => balance.status !== "ready" && balance.detail)
      .map((balance) => `${balance.label}: ${balance.detail}`);

    const payload: WoloChainAdminPayload = {
      checkedAt: new Date().toISOString(),
      chain: {
        healthy: chain.healthy,
        chainId: chain.chainId,
        chainName: chain.chainName,
        statusLabel: chain.statusLabel,
        consensusStatus: chain.consensusStatus,
        latestBlockHeight: chain.latestBlockHeight,
        latestBlockTime: chain.latestBlockTime,
        lastBlockAgeSeconds: chain.lastBlockAgeSeconds,
        peers: chain.peers,
        sourceLabel: chain.sourceLabel,
      },
      settlementService,
      balances: {
        escrow,
        payoutSigner,
        treasury,
      },
      challengeRuns: challengeRows.map(toChallengeRun),
      warnings: [...settlementService.warnings, ...balanceWarnings],
    };

    return NextResponse.json(payload, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    console.error("Failed to load WoloChain admin payload:", error);
    return NextResponse.json(
      { detail: "WoloChain admin payload unavailable" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
