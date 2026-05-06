import { NextRequest, NextResponse } from "next/server";

import type {
  WoloChainAdminBalance,
  WoloChainAdminChallengeRun,
  WoloChainAdminPayload,
} from "@/lib/adminWoloChainTypes";
import { requireAdmin } from "@/lib/adminSession";
import { buildChallengeEconomySurface } from "@/lib/challengeEconomy";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";
import { fetchWoloBalanceAmount, fetchWoloStatusSnapshot } from "@/lib/woloRuntime";
import { WOLO_COIN_DECIMALS, formatWoloAmount, getWoloBetEscrowRuntime } from "@/lib/woloChain";
import { getWoloSettlementSurfaceStatus } from "@/lib/woloBetSettlement";
import {
  resolveAddressFromEnv,
  resolveCommunityTreasuryAddressConfig,
  type WoloAddressConfig,
} from "@/lib/woloCommunityTreasury";

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

function getPayoutSignerAddressConfig() {
  return resolveAddressFromEnv(PAYOUT_SIGNER_ADDRESS_ENV_NAMES);
}

const PAYOUT_SIGNER_ADDRESS_ENV_NAMES = ["WOLO_BET_PAYOUT_ADDRESS"] as const;

const DEX_LIQUIDITY_ADDRESS_ENV_NAMES = [
  "WOLO_DEX_LIQUIDITY_ADDRESS",
  "WOLO_DEX_LIQUIDITY_WALLET_ADDRESS",
  "WOLO_LIQUIDITY_ADDRESS",
  "WOLO_LIQUIDITY_WALLET_ADDRESS",
  "NEXT_PUBLIC_WOLO_DEX_LIQUIDITY_ADDRESS",
  "NEXT_PUBLIC_WOLO_DEX_LIQUIDITY_WALLET_ADDRESS",
  "NEXT_PUBLIC_WOLO_LIQUIDITY_ADDRESS",
] as const;

const TREASURY_SNAPSHOT_ACCOUNT_KEYS = [
  "communitytreasury",
  "community_treasury",
  "treasury",
  "matchguaranteetreasury",
  "match_guarantee_treasury",
] as const;

const DEX_LIQUIDITY_SNAPSHOT_ACCOUNT_KEYS = [
  "dexliquidity",
  "dex_liquidity",
  "dexliquiditywallet",
  "dex_liquidity_wallet",
  "liquidity",
] as const;

type BalanceFallback = {
  amountUWolo: string | null;
  amountWolo: string | null;
};

type TreasuryConfig = WoloAddressConfig & {
  fallbackBalance: BalanceFallback | null;
  missingDetail: string;
};

function normalizeSnapshotKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function formatSnapshotBalance(account: { uwolo: number; wolo: number }): BalanceFallback {
  const amountUWolo =
    Number.isFinite(account.uwolo) && account.uwolo > 0
      ? String(Math.round(account.uwolo))
      : Number.isFinite(account.wolo)
        ? String(Math.round(account.wolo * 10 ** WOLO_COIN_DECIMALS))
        : null;
  const amountWolo =
    Number.isFinite(account.wolo)
      ? `${account.wolo.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} WOLO`
      : amountUWolo
        ? `${formatWoloAmount(amountUWolo)} WOLO`
        : null;

  return {
    amountUWolo,
    amountWolo,
  };
}

async function resolveCommunityTreasuryConfig(): Promise<TreasuryConfig> {
  return resolveConfiguredBalanceAccount({
    envConfig: resolveCommunityTreasuryAddressConfig(),
    snapshotKeys: TREASURY_SNAPSHOT_ACCOUNT_KEYS,
    missingDetail:
      "Configure WOLO_COMMUNITY_TREASURY_ADDRESS, or set WOLO_LOCAL_BALANCES_FILE to a snapshot exposing accounts.communitytreasury.",
  });
}

async function resolveDexLiquidityConfig(): Promise<TreasuryConfig> {
  return resolveConfiguredBalanceAccount({
    envConfig: resolveAddressFromEnv(DEX_LIQUIDITY_ADDRESS_ENV_NAMES),
    snapshotKeys: DEX_LIQUIDITY_SNAPSHOT_ACCOUNT_KEYS,
    missingDetail:
      "Configure WOLO_DEX_LIQUIDITY_ADDRESS, or set WOLO_LOCAL_BALANCES_FILE to a snapshot exposing accounts.dexliquidity.",
  });
}

async function resolveConfiguredBalanceAccount({
  envConfig,
  snapshotKeys,
  missingDetail,
}: {
  envConfig: WoloAddressConfig;
  snapshotKeys: readonly string[];
  missingDetail: string;
}): Promise<TreasuryConfig> {
  if (envConfig.address) {
    return {
      ...envConfig,
      fallbackBalance: null,
      missingDetail: "",
    };
  }

  const snapshot = await loadWoloDevSnapshot();
  if (snapshot?.accounts) {
    const wantedKeys = new Set(snapshotKeys.map(normalizeSnapshotKey));
    const entry = Object.entries(snapshot.accounts).find(([key]) =>
      wantedKeys.has(normalizeSnapshotKey(key))
    );

    if (entry) {
      const [key, account] = entry;
      return {
        address: account.address,
        sourceLabel: `WOLO local snapshot: ${key}`,
        fallbackBalance: formatSnapshotBalance(account),
        missingDetail: "",
      };
    }
  }

  return {
    address: null,
    sourceLabel: null,
    fallbackBalance: null,
    missingDetail,
  };
}

async function loadBalance(
  key: WoloChainAdminBalance["key"],
  label: string,
  address: string | null,
  missingDetail: string,
  options?: {
    configSource?: string | null;
    fallbackBalance?: BalanceFallback | null;
  }
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
      configSource: null,
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
      configSource: options?.configSource ?? null,
    };
  } catch (error) {
    if (options?.fallbackBalance?.amountWolo) {
      return {
        key,
        label,
        address,
        amountUWolo: options.fallbackBalance.amountUWolo,
        amountWolo: options.fallbackBalance.amountWolo,
        status: "ready",
        detail:
          error instanceof Error
            ? `Live lookup failed; showing configured snapshot balance. ${error.message}`
            : "Live lookup failed; showing configured snapshot balance.",
        configSource: options.configSource ?? null,
      };
    }

    return {
      key,
      label,
      address,
      amountUWolo: null,
      amountWolo: null,
      status: "error",
      detail: error instanceof Error ? error.message : "Balance lookup failed.",
      configSource: options?.configSource ?? null,
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
      challengerFundingWalletAddress: row.challengerFundingWalletAddress,
      challengedFundingWalletAddress: row.challengedFundingWalletAddress,
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
    const payoutSignerConfig = getPayoutSignerAddressConfig();
    const treasuryConfig = await resolveCommunityTreasuryConfig();
    const dexLiquidityConfig = await resolveDexLiquidityConfig();

    const [chain, settlementService, balances, challengeRows] = await Promise.all([
      fetchWoloStatusSnapshot(),
      getWoloSettlementSurfaceStatus(),
      Promise.all([
        loadBalance(
          "escrow",
          "Escrow balance",
          escrowRuntime.escrowAddress,
          "WOLO_BET_ESCROW_ADDRESS is not configured.",
          {
            configSource: escrowRuntime.escrowAddress ? "WOLO_BET_ESCROW_ADDRESS" : null,
          }
        ),
        loadBalance(
          "payoutSigner",
          "Payout signer balance",
          payoutSignerConfig.address,
          "WOLO_BET_PAYOUT_ADDRESS is not configured. Admin wallet cards do not infer the payout signer from escrow.",
          {
            configSource: payoutSignerConfig.sourceLabel,
          }
        ),
        loadBalance(
          "treasury",
          "Treasury balance",
          treasuryConfig.address,
          treasuryConfig.missingDetail,
          {
            configSource: treasuryConfig.sourceLabel,
            fallbackBalance: treasuryConfig.fallbackBalance,
          }
        ),
        dexLiquidityConfig.address
          ? loadBalance(
              "dexLiquidity",
              "DEX liquidity balance",
              dexLiquidityConfig.address,
              dexLiquidityConfig.missingDetail,
              {
                configSource: dexLiquidityConfig.sourceLabel,
                fallbackBalance: dexLiquidityConfig.fallbackBalance,
              }
            )
          : Promise.resolve(null),
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

    const [escrow, payoutSigner, treasury, dexLiquidity] = balances;
    const balanceWarnings = balances
      .filter((balance): balance is WoloChainAdminBalance => Boolean(balance))
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
        dexLiquidity,
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
