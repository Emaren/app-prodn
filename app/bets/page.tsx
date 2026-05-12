"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OfflineSigner } from "@cosmjs/proto-signing";
import { Monitor, MonitorOff, Play } from "lucide-react";
import { toast } from "sonner";

import BetsViewToggle from "@/components/bets/BetsViewToggle";
import ResultCard from "@/components/bets/ResultCard";
import YourBookSection from "@/components/bets/YourBookSection";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import FounderBonusModal from "@/components/bets/FounderBonusModal";
import WarTape from "@/components/bets/WarTape";
import { isRecoveryBookOpen } from "@/components/bets/page-shared";
import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import {
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_DEFAULT_GAS_PRICE,
  WOLO_RPC_URL,
  toUwoLoAmount,
  woloChainConfig,
} from "@/lib/woloChain";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";
const STAKE_OPTIONS = [10, 25, 50, 100] as const;
const BETS_POLL_INTERVAL_MS = 5_000;
const STAKE_RECOVERY_STORAGE_KEY = "aoe2hdbets.betStakeRecovery.v1";
const BETS_VIEW_STORAGE_KEY = "aoe2hdbets.betsView.v1";
type BetSide = "left" | "right";
type BetStatus = "open" | "closing" | "live" | "settled";
type BetsViewMode = "basic" | "advanced";
type FounderBonusType = "participants" | "winner";
type BroadcastViewKey = "left" | "god" | "right";

type BroadcastFeed = {
  id: number;
  sessionKey: string;
  provider: "twitch" | "youtube" | "steam" | "discord" | "custom";
  role: "caster" | "observer" | "player_pov" | "team_pov" | "postgame" | "external";
  label: string;
  url: string;
  embedId: string | null;
  playerLabel: string | null;
  isPrimary: boolean;
  status: string;
  canEmbed: boolean;
  externalOnly: boolean;
};

type BroadcastFeeds = {
  left: BroadcastFeed | null;
  god: BroadcastFeed | null;
  right: BroadcastFeed | null;
};

type BroadcastPreviewUrls = {
  left: string | null;
  god: string | null;
  right: string | null;
};

const EMPTY_BROADCAST_FEEDS: BroadcastFeeds = {
  left: null,
  god: null,
  right: null,
};

const EMPTY_BROADCAST_PREVIEW_URLS: BroadcastPreviewUrls = {
  left: null,
  god: null,
  right: null,
};

type BetBoardSide = {
  key: BetSide;
  name: string;
  href: string | null;
  poolWolo: number;
  crowdPercent: number;
  slips: number;
  seededWolo: number;
};

type BetBoardMarket = {
  id: number;
  slug: string;
  title: string;
  eventLabel: string;
  href: string | null;
  linkedSessionKey: string | null;
  linkedGameStatsId: number | null;
  status: BetStatus;
  featured: boolean;
  closeLabel: string;
  scheduledStartAt: string | null;
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  founderBonuses: BetFounderChip[];
  warTape: BetWarTapeRow[];
  broadcastFeeds: BroadcastFeeds;
  broadcastPreviewUrls: BroadcastPreviewUrls;
  viewerWager: {
    side: BetSide;
    amountWolo: number;
    slipCount: number;
    executionMode: "app_only" | "onchain_escrow";
    stakeTxHash: string | null;
    stakeWalletAddress: string | null;
    stakeLockedAt: string | null;
  } | null;
  winnerSide: BetSide | null;
};

type BetFounderChip = {
  id: number;
  bonusType: FounderBonusType;
  totalAmountWolo: number;
  note: string | null;
  status: string;
  createdAt: string;
};

type BetWarTapeRow = {
  id: string;
  kind: "tx" | "event";
  label: string;
  actor: string | null;
  amountWolo: number | null;
  side: BetSide | null;
  note: string | null;
  txHash: string | null;
  txUrl: string | null;
  createdAt: string;
};

type BetBookEntry = {
  marketId: number;
  marketSlug: string;
  title: string;
  eventLabel: string;
  side: BetSide;
  pickedLabel: string;
  amountWolo: number;
  slipCount: number;
  projectedReturnWolo: number;
  closeLabel: string;
  scheduledStartAt: string | null;
  status: BetStatus;
  executionMode: "app_only" | "onchain_escrow";
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
};

type BetSettledResult = {
  id: number;
  title: string;
  eventLabel: string;
  winner: string;
  mapName: string;
  totalPotWolo: number;
  payoutWolo: number;
  settledAt: string | null;
  href: string | null;
  linkedSessionKey: string | null;
  broadcastFeeds: BroadcastFeeds;
  broadcastPreviewUrls: BroadcastPreviewUrls;
  founderBonuses: BetFounderChip[];
};

type BetBoardSnapshot = {
  generatedAt: string;
  viewerName: string | null;
  wolo: {
    betEscrowMode: "disabled" | "optional" | "required";
    betEscrowAddress: string | null;
    onchainEscrowEnabled: boolean;
    onchainEscrowRequired: boolean;
    escrowConfigError: string | null;
    betTestMode: boolean;
    settlementServiceConfigured: boolean;
    settlementAuthConfigured: boolean;
    settlementExecutionMode: "settlement_service" | "local_signer_fallback" | "unconfigured";
    groupedRunCapability:
      | "supported"
      | "fallback_to_singles"
      | "not_configured"
      | "auth_required"
      | "auth_failed"
      | "unknown";
    escrowVerifyCapability: "supported" | "not_configured" | "unavailable" | "unknown";
    escrowRecentCapability: "supported" | "not_configured" | "unavailable" | "unknown";
    settlementSurfaceWarnings: string[];
    settlementSurfaceDetail: string | null;
  };
  recovery: {
    unresolvedStakeIntents: Array<{
      id: number;
      marketId: number;
      marketStatus: BetStatus;
      title: string;
      eventLabel: string;
      side: BetSide;
      amountWolo: number;
      status: string;
      stakeTxHash: string | null;
      walletAddress: string | null;
      errorDetail: string | null;
      updatedAt: string;
    }>;
  };
  featuredMarket: BetBoardMarket | null;
  openMarkets: BetBoardMarket[];
  settledResults: BetSettledResult[];
  yourBook: {
    activeCount: number;
    stakedWolo: number;
    projectedReturnWolo: number;
    openWagers: BetBookEntry[];
  };
  heat: {
    biggestPot: {
      label: string;
      potWolo: number;
    } | null;
    bestReturn: {
      label: string;
      returnMultiplier: number;
    } | null;
    liveCount: number;
  };
};

type SelectionState = {
  marketId: number;
  side: BetSide;
  stake: number;
};

type LockWorkflow = {
  marketId: number;
  phase: "awaiting_wallet" | "confirming_chain" | "recording_wager";
  stakeTxHash: string | null;
};

type FounderComposerState = {
  marketId: number;
  marketTitle: string;
  bonusType: FounderBonusType;
  amountValue: string;
  noteValue: string;
};

type KeplrKey = {
  bech32Address?: string;
  isNanoLedger?: boolean;
};

type BetBrowserWindow = Window & {
  keplr?: {
    enable?: (chainId: string) => Promise<void>;
    experimentalSuggestChain?: (config: typeof woloChainConfig) => Promise<void>;
    getOfflineSignerAuto?: (chainId: string) => Promise<unknown>;
    getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
    getKey?: (chainId: string) => Promise<{ bech32Address: string }>;
  };
  getOfflineSigner?: (chainId: string) => unknown;
  getOfflineSignerOnlyAmino?: (chainId: string) => unknown;
};

type BetSignerResolution = {
  signer: OfflineSigner;
  signerAddress: string;
  isLedger: boolean;
};

type StakeExecutionResult = {
  walletAddress: string | null;
  stakeTxHash: string | null;
  executionMode: "app_only" | "onchain_escrow";
  walletProvider: "keplr" | null;
  walletType: "ledger" | "keplr" | null;
};

type PreparedStakeWallet = {
  signer: OfflineSigner;
  walletAddress: string;
  walletProvider: "keplr";
  walletType: "ledger" | "keplr";
  isLedger: boolean;
};

type PendingStakeRecovery = {
  intentId: number;
  marketId: number;
  side: BetSide;
  amountWolo: number;
  walletAddress: string | null;
  stakeTxHash: string | null;
  walletProvider: string | null;
  walletType: string | null;
  browserInfo: string | null;
  routePath: string;
  updatedAt: string;
};

function shortTxHash(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

function isOnchainViewerWager(
  wager: BetBoardMarket["viewerWager"]
): wager is NonNullable<BetBoardMarket["viewerWager"]> {
  return Boolean(wager && wager.executionMode === "onchain_escrow");
}

function normalizePendingStakeRecovery(input: Partial<PendingStakeRecovery>) {
  if (!Number.isFinite(input.intentId)) return null;
  if (!Number.isFinite(input.marketId)) return null;
  if (input.side !== "left" && input.side !== "right") return null;
  if (!Number.isFinite(input.amountWolo) || (input.amountWolo ?? 0) < 1) return null;

  return {
    intentId: input.intentId as number,
    marketId: input.marketId as number,
    side: input.side,
    amountWolo: Math.round(input.amountWolo as number),
    walletAddress: typeof input.walletAddress === "string" ? input.walletAddress.trim() || null : null,
    stakeTxHash: typeof input.stakeTxHash === "string" ? input.stakeTxHash.trim() || null : null,
    walletProvider:
      typeof input.walletProvider === "string" ? input.walletProvider.trim() || null : null,
    walletType: typeof input.walletType === "string" ? input.walletType.trim() || null : null,
    browserInfo: typeof input.browserInfo === "string" ? input.browserInfo.trim() || null : null,
    routePath: typeof input.routePath === "string" ? input.routePath.trim() || "/bets" : "/bets",
    updatedAt:
      typeof input.updatedAt === "string" ? input.updatedAt.trim() || new Date().toISOString() : new Date().toISOString(),
  } satisfies PendingStakeRecovery;
}

function readPendingStakeRecoveries() {
  if (typeof window === "undefined") return [] as PendingStakeRecovery[];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STAKE_RECOVERY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) =>
        normalizePendingStakeRecovery(
          entry && typeof entry === "object" ? (entry as Partial<PendingStakeRecovery>) : {}
        )
      )
      .filter((entry): entry is PendingStakeRecovery => Boolean(entry));
  } catch {
    return [];
  }
}

function writePendingStakeRecoveries(items: PendingStakeRecovery[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STAKE_RECOVERY_STORAGE_KEY, JSON.stringify(items));
}

function upsertPendingStakeRecovery(item: PendingStakeRecovery) {
  const current = readPendingStakeRecoveries().filter((entry) => entry.intentId !== item.intentId);
  current.unshift(item);
  writePendingStakeRecoveries(current.slice(0, 20));
}

function removePendingStakeRecovery(intentId: number) {
  writePendingStakeRecoveries(
    readPendingStakeRecoveries().filter((entry) => entry.intentId !== intentId)
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatExactWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function fromUWoloAmount(raw?: string | null) {
  const numeric = Number.parseFloat(raw || "0");
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric / 10 ** 6);
}

function resolveStakeMax(balanceRaw?: string | null) {
  const walletCap = fromUWoloAmount(balanceRaw);
  return walletCap > 0 ? Math.min(walletCap, 50_000) : 50_000;
}

function validateStakeAmount(stake: number, maxStake: number) {
  if (!Number.isFinite(stake) || !Number.isInteger(stake)) {
    return "Whole numbers only.";
  }
  if (stake < 1) {
    return "Enter at least 1 WOLO.";
  }
  if (stake > maxStake) {
    return `Max ${maxStake.toLocaleString()} WOLO with the current wallet/app limit.`;
  }
  return null;
}

function formatSettledTime(value: string | null) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatScheduledStart(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStartsIn(diffMs: number) {
  if (diffMs <= 0) return "Live now";

  const totalMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    return `Starts in ${days}d ${hours}h`;
  }

  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `Starts in ${hours}h ${minutes}m`;
  }

  return `Starts in ${totalMinutes}m`;
}

function getMarketTiming(market: BetBoardMarket, nowMs: number) {
  const startLabel = formatScheduledStart(market.scheduledStartAt);
  if (!startLabel) {
    return null;
  }

  const startMs = new Date(market.scheduledStartAt || "").getTime();
  const countdownLabel =
    market.status === "live" || startMs <= nowMs ? "Live now" : formatStartsIn(startMs - nowMs);

  return {
    startLabel,
    countdownLabel,
  };
}

function useNowTicker(intervalMs = 30_000) {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const refresh = () => setNowMs(Date.now());
    refresh();

    const interval = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [intervalMs]);

  return nowMs;
}

function projectReturn(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function safePlayerName(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function sameBroadcastSource(
  first: BroadcastFeed | null | undefined,
  second: BroadcastFeed | null | undefined
) {
  if (!first || !second) return false;
  const firstUrl = first.url.trim().toLowerCase();
  const secondUrl = second.url.trim().toLowerCase();
  return Boolean(firstUrl && firstUrl === secondUrl);
}

function splitMatchTitle(value: string | null | undefined) {
  const title = value?.trim() || "";
  const [left, ...rightParts] = title.split(/\s+vs\s+/i);
  const right = rightParts.join(" vs ");

  return {
    leftName: safePlayerName(left, "Player 1"),
    rightName: safePlayerName(right, "Player 2"),
  };
}


function isPendingLivePlaceholderMarket(market: BetBoardMarket | null | undefined) {
  if (!market) return false;

  const label = market.eventLabel.toLowerCase();
  const title = market.title.toLowerCase();
  const rightName = market.right?.name?.toLowerCase?.() ?? "";

  return (
    label.includes("book pending") ||
    label.includes("players parsing") ||
    title === "live 4v4 detected" ||
    rightName === "parsing"
  );
}

function describeStakeLockError(error: unknown, options?: { isLedger?: boolean }) {
  const message =
    error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : "";
  const fallback = "Could not lock the wager.";
  const normalized = (message || fallback).toLowerCase();

  if (
    normalized.includes("rejected") ||
    normalized.includes("denied") ||
    normalized.includes("cancelled") ||
    normalized.includes("canceled")
  ) {
    return options?.isLedger
      ? "Ledger approval was cancelled before the WOLO stake broadcast finished."
      : "Keplr approval was cancelled before the WOLO stake broadcast finished.";
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch balance") ||
    normalized.includes("network error")
  ) {
    return options?.isLedger
      ? "Keplr lost the Ledger handoff before the WOLO stake broadcast finished. Keep the Ledger unlocked in the Cosmos app, approve on-device, then retry once."
      : "Keplr lost the chain handshake before the WOLO stake broadcast finished. Refresh and retry once.";
  }

  if (
    normalized.includes("ledger") ||
    normalized.includes("transportstatuserror") ||
    normalized.includes("device") ||
    normalized.includes("usb")
  ) {
    return "Ledger did not finish signing the WOLO stake. Unlock the device, open the Cosmos app, then approve the transaction in both Keplr and on the Ledger.";
  }

  return message || fallback;
}

async function resolveBetSigner(
  keplrWindow: BetBrowserWindow,
  fallbackAddress: string
): Promise<BetSignerResolution> {
  const key = keplrWindow.keplr?.getKey
    ? ((await keplrWindow.keplr.getKey(WOLO_CHAIN_ID).catch(() => null)) as KeplrKey | null)
    : null;
  const keyAddress = key?.bech32Address?.trim() || "";
  const isLedger = Boolean(key?.isNanoLedger);

  if (isLedger) {
    const aminoSigner =
      ((keplrWindow.keplr?.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID) ||
        keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID)) as OfflineSigner | undefined);

    if (!aminoSigner) {
      throw new Error("Ledger account detected, but Keplr Amino signer is unavailable in this browser.");
    }

    const accounts = await aminoSigner.getAccounts();
    const signerAddress = accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

    if (!signerAddress) {
      throw new Error("Connected Ledger returned no WOLO address for this bet.");
    }

    return {
      signer: aminoSigner,
      signerAddress,
      isLedger: true,
    };
  }

  if (keplrWindow.keplr?.getOfflineSignerAuto) {
    const signer = (await keplrWindow.keplr.getOfflineSignerAuto(WOLO_CHAIN_ID)) as OfflineSigner;
    const accounts = await signer.getAccounts();
    const signerAddress = accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

    if (!signerAddress) {
      throw new Error("Connected wallet returned no WOLO address for this bet.");
    }

    return {
      signer,
      signerAddress,
      isLedger: false,
    };
  }

  const signer =
    ((keplrWindow.getOfflineSignerOnlyAmino?.(WOLO_CHAIN_ID) ||
      keplrWindow.getOfflineSigner?.(WOLO_CHAIN_ID)) as OfflineSigner | undefined);

  if (!signer) {
    throw new Error("Keplr offline signer was not found in this browser.");
  }

  const accounts = await signer.getAccounts();
  const signerAddress = accounts[0]?.address?.trim() || keyAddress || fallbackAddress;

  if (!signerAddress) {
    throw new Error("Connected wallet returned no WOLO address for this bet.");
  }

  return {
    signer,
    signerAddress,
    isLedger: false,
  };
}

function statusPill(status: BetStatus) {
  if (status === "live") {
    return "border-emerald-300/22 bg-[linear-gradient(135deg,rgba(6,95,70,0.58),rgba(16,185,129,0.16))] text-emerald-50";
  }
  if (status === "closing") {
    return "border-amber-300/18 bg-[linear-gradient(135deg,rgba(146,64,14,0.50),rgba(217,119,6,0.16))] text-amber-50";
  }
  if (status === "settled") {
    return "border-sky-300/18 bg-[linear-gradient(135deg,rgba(14,116,144,0.42),rgba(14,165,233,0.12))] text-sky-50";
  }
  return "border-emerald-300/18 bg-[linear-gradient(135deg,rgba(6,95,70,0.42),rgba(16,185,129,0.13))] text-emerald-50";
}

function groupedSettlementLabel(
  capability:
    | "supported"
    | "fallback_to_singles"
    | "not_configured"
    | "auth_required"
    | "auth_failed"
    | "unknown"
) {
  switch (capability) {
    case "supported":
      return "grouped payouts ready";
    case "fallback_to_singles":
      return "single-payout fallback";
    case "auth_required":
      return "settlement auth missing";
    case "auth_failed":
      return "settlement auth failed";
    case "not_configured":
      return "settlement service off";
    default:
      return "settlement support unconfirmed";
  }
}

function groupedSettlementTone(
  capability:
    | "supported"
    | "fallback_to_singles"
    | "not_configured"
    | "auth_required"
    | "auth_failed"
    | "unknown"
) {
  switch (capability) {
    case "supported":
      return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
    case "fallback_to_singles":
      return "border-amber-300/20 bg-amber-400/10 text-amber-100";
    case "auth_required":
    case "auth_failed":
      return "border-rose-300/20 bg-rose-400/10 text-rose-100";
    case "not_configured":
      return "border-white/[0.08] bg-white/[0.04] text-slate-300";
    default:
      return "border-indigo-300/20 bg-indigo-400/10 text-indigo-100";
  }
}

function sideSurface(selected: boolean, emphasis: "warm" | "cool") {
  if (selected && emphasis === "warm") {
    return "border-amber-200/18 bg-[linear-gradient(155deg,rgba(251,191,36,0.32),rgba(180,83,9,0.18)_58%,rgba(15,23,42,0.72))] text-white shadow-[0_16px_38px_rgba(245,158,11,0.18)]";
  }
  if (selected) {
    return "border-sky-200/18 bg-[linear-gradient(155deg,rgba(125,211,252,0.22),rgba(37,99,235,0.18)_58%,rgba(15,23,42,0.72))] text-white shadow-[0_16px_38px_rgba(37,99,235,0.18)]";
  }
  return "border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.025))] text-slate-100 hover:border-white/10 hover:bg-white/[0.06]";
}

function edgeButton(kind: "gold" | "blue" | "glass") {
  if (kind === "gold") {
    return "border border-amber-200/14 bg-[linear-gradient(135deg,#fde68a_0%,#f5c95f_28%,#d7a73e_72%,#8c5e10_100%)] text-slate-950 shadow-[0_14px_34px_rgba(245,158,11,0.18)] hover:brightness-105";
  }
  if (kind === "blue") {
    return "border border-sky-200/12 bg-[linear-gradient(135deg,#dbeafe_0%,#93c5fd_26%,#3b82f6_68%,#1d4ed8_100%)] text-slate-950 shadow-[0_14px_34px_rgba(59,130,246,0.16)] hover:brightness-105";
  }
  return "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 hover:border-white/14 hover:bg-white/[0.08]";
}

function shellClass() {
  return "min-w-0 w-full max-w-full rounded-[1.9rem] border border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.08),transparent_30%),linear-gradient(180deg,rgba(13,20,36,0.98),rgba(8,13,24,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.36)]";
}

function insetClass() {
  return "min-w-0 max-w-full rounded-[1.55rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.024))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
}

function cardClass() {
  return "min-w-0 max-w-full rounded-[1.45rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.02))] shadow-[0_18px_42px_rgba(2,6,23,0.22)]";
}

function CoinMark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src={WOLO_LOGO_SRC}
      alt=""
      width={small ? 18 : 22}
      height={small ? 18 : 22}
      className={small ? "h-[18px] w-[18px] object-contain" : "h-[22px] w-[22px] object-contain"}
    />
  );
}

function MarketStatusPill({ market }: { market: BetBoardMarket }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${statusPill(market.status)}`}>
      {market.status === "live" ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-35" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
        </span>
      ) : null}
      <span>{market.status === "live" ? "Live" : market.closeLabel}</span>
    </span>
  );
}

function MarketTimingRail({ market, nowMs }: { market: BetBoardMarket; nowMs: number }) {
  const timing = getMarketTiming(market, nowMs);
  if (!timing) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
      <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
        Start {timing.startLabel}
      </span>
      <span
        className={`rounded-full border px-3 py-1 ${
          timing.countdownLabel === "Live now"
            ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
            : "border-white/10 bg-white/[0.04] text-slate-300"
        }`}
      >
        {timing.countdownLabel}
      </span>
    </div>
  );
}

export default function BetsPage() {
  const { isAdmin, isAuthenticated, loading, loginWithSteam, user } = useUserAuth();
  const { address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const { data: rawWalletBalance } = useWoloBalance(connectedWalletAddress || undefined);
  const nowMs = useNowTicker();
  const [board, setBoard] = useState<BetBoardSnapshot | null>(null);
  const [betsView, setBetsView] = useState<BetsViewMode>("basic");
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [lockWorkflow, setLockWorkflow] = useState<LockWorkflow | null>(null);
  const [recoveringIntentId, setRecoveringIntentId] = useState<number | null>(null);
  const [attemptedAutoRecoverIds, setAttemptedAutoRecoverIds] = useState<number[]>([]);
  const [founderComposer, setFounderComposer] = useState<FounderComposerState | null>(null);
  const [savingFounderBonus, setSavingFounderBonus] = useState(false);
  const [founderBonusError, setFounderBonusError] = useState<string | null>(null);
  const [broadcastVisible, setBroadcastVisible] = useState(true);
  const [pendingStakeRecoveries, setPendingStakeRecoveries] = useState<PendingStakeRecovery[]>([]);

  const syncPendingStakeRecoveries = useCallback(() => {
    setPendingStakeRecoveries(readPendingStakeRecoveries());
  }, []);

  const savePendingStakeRecovery = useCallback(
    (item: PendingStakeRecovery) => {
      upsertPendingStakeRecovery(item);
      syncPendingStakeRecoveries();
    },
    [syncPendingStakeRecoveries]
  );

  const clearPendingStakeRecovery = useCallback(
    (intentId: number) => {
      removePendingStakeRecovery(intentId);
      syncPendingStakeRecoveries();
    },
    [syncPendingStakeRecoveries]
  );

  useEffect(() => {
    syncPendingStakeRecoveries();
  }, [syncPendingStakeRecoveries]);

  const loadBoard = useCallback(async (quiet = false) => {
    try {
      const response = await fetch("/api/bets", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Bet board failed to load.");
      }
      return (await response.json()) as BetBoardSnapshot;
    } catch (error) {
      console.error("Failed to load bet board:", error);
      if (!quiet) {
        toast.error("The book is quiet right now.");
      }
      return null;
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedView = window.localStorage.getItem(BETS_VIEW_STORAGE_KEY);
    if (storedView === "basic" || storedView === "advanced") {
      setBetsView(storedView);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(BETS_VIEW_STORAGE_KEY, betsView);
  }, [betsView]);

  useEffect(() => {
    let cancelled = false;

    function handleForegroundRefresh() {
      if (document.visibilityState === "visible") {
        void loadBoard(true).then((payload) => {
          if (!cancelled && payload) {
            setBoard(payload);
          }
        });
      }
    }

    void loadBoard().then((payload) => {
      if (!cancelled && payload) {
        setBoard(payload);
      }
    });

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBoard(true).then((payload) => {
          if (!cancelled && payload) {
            setBoard(payload);
          }
        });
      }
    }, BETS_POLL_INTERVAL_MS);

    window.addEventListener("focus", handleForegroundRefresh);
    document.addEventListener("visibilitychange", handleForegroundRefresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleForegroundRefresh);
      document.removeEventListener("visibilitychange", handleForegroundRefresh);
    };
  }, [loadBoard]);

  const featuredMarket = board?.featuredMarket ?? null;
  const spotlightMarket = useMemo(
    () => featuredMarket ?? board?.openMarkets?.[0] ?? null,
    [board?.openMarkets, featuredMarket]
  );
  const openMarkets = useMemo(
    () =>
      (board?.openMarkets || []).filter((market) => !spotlightMarket || market.id !== spotlightMarket.id),
    [board?.openMarkets, spotlightMarket]
  );
  const totalBookPot = useMemo(
    () => {
      const openPot = (board?.openMarkets || []).reduce((sum, market) => sum + market.totalPotWolo, 0);
      if (openPot > 0) {
        return openPot;
      }

      return board?.settledResults?.[0]?.totalPotWolo || 0;
    },
    [board?.openMarkets, board?.settledResults]
  );
  const liveCount = board?.heat.liveCount || 0;
  const openCount = board?.openMarkets.length || 0;
  const recentResults = board?.settledResults || [];
  const runtimeBetEscrowMode = board?.wolo.betEscrowMode || "disabled";
  const runtimeBetEscrowAddress = board?.wolo.betEscrowAddress?.trim() || "";
  const onchainBetEscrowEnabled = board?.wolo.onchainEscrowEnabled ?? false;
  const onchainBetEscrowRequired = board?.wolo.onchainEscrowRequired ?? false;
  const runtimeBetEscrowConfigError = board?.wolo.escrowConfigError ?? null;
  const runtimeBetTestMode = board?.wolo.betTestMode ?? false;
  const settlementExecutionMode = board?.wolo.settlementExecutionMode || "unconfigured";
  const groupedRunCapability = board?.wolo.groupedRunCapability || "not_configured";
  const settlementSurfaceWarnings = board?.wolo.settlementSurfaceWarnings || [];
  const settlementSurfaceDetail = board?.wolo.settlementSurfaceDetail ?? null;
  const unresolvedStakeIntents = board?.recovery.unresolvedStakeIntents || [];
  const maxStakeWolo = useMemo(() => resolveStakeMax(rawWalletBalance), [rawWalletBalance]);

  const refreshBoard = useCallback(async (nextPayload?: BetBoardSnapshot) => {
    if (nextPayload) {
      setBoard(nextPayload);
      return;
    }

    const payload = await loadBoard(true);
    if (!payload) {
      throw new Error("Book refresh failed.");
    }
    setBoard(payload);
  }, [loadBoard]);

  function openFounderComposer(market: BetBoardMarket, bonusType: FounderBonusType) {
    setFounderBonusError(null);
    setFounderComposer({
      marketId: market.id,
      marketTitle: market.title,
      bonusType,
      amountValue: bonusType === "participants" ? "200" : "300",
      noteValue: "",
    });
  }

  async function submitFounderBonus() {
    if (!founderComposer) {
      return;
    }

    setSavingFounderBonus(true);
    setFounderBonusError(null);

    try {
      const response = await fetch(
        `/api/admin/bets/markets/${founderComposer.marketId}/founders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bonusType: founderComposer.bonusType,
            amountWolo: founderComposer.amountValue,
            note: founderComposer.noteValue || undefined,
          }),
        }
      );

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Founder bonus could not be saved.");
      }

      await refreshBoard();
      toast.success(
        founderComposer.bonusType === "winner"
          ? "Founders Win attached."
          : "Founders Bonus attached."
      );
      setFounderComposer(null);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Founder bonus could not be saved.";
      setFounderBonusError(detail);
    } finally {
      setSavingFounderBonus(false);
    }
  }

  function requireSignIn() {
    if (isAuthenticated) return true;
    loginWithSteam("/bets");
    return false;
  }

  async function createStakeIntent(input: {
    marketId: number;
    side: BetSide;
    amountWolo: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
  }) {
    const response = await fetch("/api/bets/stake-intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId: input.marketId,
        side: input.side,
        amountWolo: input.amountWolo,
        walletAddress: input.walletAddress || undefined,
        walletProvider: input.walletProvider || undefined,
        walletType: input.walletType || undefined,
        browserInfo:
          typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
        routePath: "/bets",
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: number;
      detail?: string;
    };

    if (!response.ok || !Number.isFinite(payload.id)) {
      throw new Error(payload.detail || "Could not prepare stake recovery.");
    }

    return payload.id as number;
  }

  async function recordStakeIntentBroadcast(
    intentId: number,
    recovery: PendingStakeRecovery
  ) {
    const response = await fetch(`/api/bets/stake-intents/${intentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_broadcast",
        walletAddress: recovery.walletAddress,
        walletProvider: recovery.walletProvider,
        walletType: recovery.walletType,
        browserInfo: recovery.browserInfo,
        routePath: recovery.routePath,
        stakeTxHash: recovery.stakeTxHash,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { detail?: string };
      throw new Error(payload.detail || "Could not record the signed stake.");
    }
  }

  async function recordStakeIntentFailure(input: {
    intentId: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
    step: string;
    rawError: string;
    status?: "failed" | "suspect" | "orphaned";
  }) {
    await fetch(`/api/bets/stake-intents/${input.intentId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_failure",
        walletAddress: input.walletAddress,
        walletProvider: input.walletProvider,
        walletType: input.walletType,
        browserInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        routePath: "/bets",
        step: input.step,
        rawError: input.rawError,
        status: input.status ?? "failed",
      }),
    }).catch(() => null);
  }

  async function recordBetWalletError(input: {
    marketId: number;
    side: BetSide;
    amountWolo: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
    step: string;
    rawError: string;
  }) {
    await fetch("/api/bets/wallet-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketId: input.marketId,
        side: input.side,
        amountWolo: input.amountWolo,
        walletAddress: input.walletAddress,
        walletProvider: input.walletProvider,
        walletType: input.walletType,
        browserInfo: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        routePath: "/bets",
        step: input.step,
        rawError: input.rawError,
      }),
    }).catch(() => null);
  }

  const recoverStakeIntent = useCallback(
    async (intentId: number, options?: { automatic?: boolean }) => {
      const recovery = readPendingStakeRecoveries().find((entry) => entry.intentId === intentId) || null;
      const unresolvedIntent =
        board?.recovery.unresolvedStakeIntents.find((entry) => entry.id === intentId) || null;
      const hasStakeProof = Boolean(unresolvedIntent?.stakeTxHash || recovery?.stakeTxHash);
      const canRecoverNow = Boolean(
        unresolvedIntent &&
          isRecoveryBookOpen(unresolvedIntent.marketStatus) &&
          hasStakeProof
      );

      if (!canRecoverNow) {
        if (!options?.automatic) {
          toast.message(
            unresolvedIntent && !isRecoveryBookOpen(unresolvedIntent.marketStatus)
              ? "This signed stake belongs to a closed book. Keep the stake proof for manual review."
              : "The recovery rail is still waiting on a usable stake proof."
          );
        }
        return;
      }

      setRecoveringIntentId(intentId);

      try {
        if (recovery?.stakeTxHash) {
          await recordStakeIntentBroadcast(intentId, recovery);
        }

        const response = await fetch(`/api/bets/stake-intents/${intentId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "recover",
            walletAddress: recovery?.walletAddress || connectedWalletAddress || null,
            stakeTxHash: recovery?.stakeTxHash || null,
          }),
        });

        const payload = (await response.json().catch(() => ({}))) as BetBoardSnapshot & {
          detail?: string;
        };

        if (!response.ok) {
          throw new Error(payload.detail || "Could not recover this signed stake.");
        }

        clearPendingStakeRecovery(intentId);
        await refreshBoard(payload);
        if (!options?.automatic) {
          toast.success("Recovered the signed WOLO stake into the book.");
        }
      } catch (error) {
        if (!options?.automatic) {
          toast.error(
            error instanceof Error ? error.message : "Could not recover this signed stake."
          );
        }
      } finally {
        setRecoveringIntentId((current) => (current === intentId ? null : current));
      }
    },
    [board, clearPendingStakeRecovery, connectedWalletAddress, refreshBoard]
  );

  useEffect(() => {
    if (!isAuthenticated || !board || recoveringIntentId || workingKey || lockWorkflow) {
      return;
    }

    const unresolved = board.recovery.unresolvedStakeIntents.find((intent) => {
      if (attemptedAutoRecoverIds.includes(intent.id)) return false;
      const pending = readPendingStakeRecoveries().find((entry) => entry.intentId === intent.id);
      if (!isRecoveryBookOpen(intent.marketStatus)) return false;
      if (pending?.stakeTxHash) return true;
      return (
        Boolean(intent.stakeTxHash) &&
        ["broadcast_submitted", "verified_unrecorded", "suspect", "orphaned"].includes(intent.status)
      );
    });

    if (!unresolved) {
      return;
    }

    setAttemptedAutoRecoverIds((current) =>
      current.includes(unresolved.id) ? current : [...current, unresolved.id]
    );
    void recoverStakeIntent(unresolved.id, { automatic: true });
  }, [
    attemptedAutoRecoverIds,
    board,
    isAuthenticated,
    lockWorkflow,
    recoverStakeIntent,
    recoveringIntentId,
    workingKey,
  ]);

  function handleSelect(market: BetBoardMarket, side: BetSide) {
    if (!requireSignIn()) return;
    const viewerWager = market.viewerWager;
    if (viewerWager && viewerWager.side !== side) {
      toast.message("This book is locked to your first side for now. Add more to that same side only.");
      return;
    }
    setSelection({
      marketId: market.id,
      side: viewerWager?.side || side,
      stake:
        selection && selection.marketId === market.id && selection.side === (viewerWager?.side || side)
          ? selection.stake
          : Math.max(1, Math.min(25, maxStakeWolo)),
    });
  }

  async function ensureWalletAddress() {
    if (!onchainBetEscrowEnabled) {
      return null;
    }

    if (connectedWalletAddress) {
      return connectedWalletAddress;
    }

    return connectKeplr();
  }

  async function prepareStakeWallet(market: BetBoardMarket): Promise<PreparedStakeWallet> {
    if (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress) {
      throw new Error(
        runtimeBetEscrowConfigError ||
          "WOLO escrow is not available for this market in the current environment."
      );
    }

    setLockWorkflow({
      marketId: market.id,
      phase: "awaiting_wallet",
      stakeTxHash: null,
    });

    const walletAddress = await ensureWalletAddress();
    if (!walletAddress) {
      throw new Error("Connect Keplr before locking a verified WOLO stake.");
    }

    const keplrWindow = window as BetBrowserWindow;

    if (keplrWindow.keplr?.experimentalSuggestChain) {
      try {
        await keplrWindow.keplr.experimentalSuggestChain(woloChainConfig);
      } catch (error) {
        console.warn("WoloChain suggest failed or already exists:", error);
      }
    }

    if (keplrWindow.keplr?.enable) {
      await keplrWindow.keplr.enable(WOLO_CHAIN_ID);
    }

    const signerResolution = await resolveBetSigner(keplrWindow, walletAddress);
    return {
      signer: signerResolution.signer,
      walletAddress: signerResolution.signerAddress,
      walletProvider: "keplr",
      walletType: signerResolution.isLedger ? "ledger" : "keplr",
      isLedger: signerResolution.isLedger,
    };
  }

  async function lockStakeOnChain(
    market: BetBoardMarket,
    amountWolo: number,
    preparedWallet?: PreparedStakeWallet | null
  ): Promise<StakeExecutionResult> {
    if (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress) {
      if (onchainBetEscrowRequired) {
        throw new Error(
          runtimeBetEscrowConfigError ||
            "Verified WOLO escrow is required here, but the WOLO escrow rail is not ready."
        );
      }

      return {
        walletAddress: null as string | null,
        stakeTxHash: null as string | null,
        executionMode: "app_only" as const,
        walletProvider: null,
        walletType: null,
      };
    }

    const signerResolution = preparedWallet || (await prepareStakeWallet(market));

    setLockWorkflow({
      marketId: market.id,
      phase: "confirming_chain",
      stakeTxHash: null,
    });

    const [{ GasPrice, SigningStargateClient }] = await Promise.all([
      import("@cosmjs/stargate"),
    ]);

    let client:
      | Awaited<ReturnType<typeof SigningStargateClient.connectWithSigner>>
      | null = null;

    try {
      client = await SigningStargateClient.connectWithSigner(
        WOLO_RPC_URL,
        signerResolution.signer,
        {
          gasPrice: GasPrice.fromString(WOLO_DEFAULT_GAS_PRICE),
        }
      );

      const result = await client.sendTokens(
        signerResolution.walletAddress,
        runtimeBetEscrowAddress,
        [{ amount: toUwoLoAmount(amountWolo), denom: WOLO_BASE_DENOM }],
        "auto",
        `AoE2HDBets bet stake · market ${market.id}`
      );

      return {
        walletAddress: signerResolution.walletAddress,
        stakeTxHash: result.transactionHash,
        executionMode: "onchain_escrow" as const,
        walletProvider: signerResolution.walletProvider,
        walletType: signerResolution.walletType,
      };
    } catch (error) {
      throw new Error(describeStakeLockError(error, { isLedger: signerResolution.isLedger }));
    } finally {
      client?.disconnect();
    }
  }

  async function handleLock(market: BetBoardMarket) {
    if (isPendingLivePlaceholderMarket(market)) {
      toast.error("This live 4v4 is still parsing. Betting opens once teams are identified.");
      return;
    }

    if (!selection || selection.marketId !== market.id) return;
    if (!requireSignIn()) return;
    const stakeValidation = validateStakeAmount(selection.stake, maxStakeWolo);
    if (stakeValidation) {
      toast.error(stakeValidation);
      return;
    }
    if (market.viewerWager && market.viewerWager.side !== selection.side) {
      toast.error("This book is locked to your first side for now.");
      return;
    }
    if (onchainBetEscrowRequired && (!onchainBetEscrowEnabled || !runtimeBetEscrowAddress)) {
      toast.error(
        runtimeBetEscrowConfigError ||
          "Verified WOLO escrow is required here, but the WOLO escrow rail is not ready."
      );
      return;
    }

    setWorkingKey(`lock-${market.id}`);
    let intentId: number | null = null;
    let pendingRecovery: PendingStakeRecovery | null = null;
    let preparedWallet: PreparedStakeWallet | null = null;
    let workflowStep: LockWorkflow["phase"] | "stake_intent" | "lock_wager" =
      "awaiting_wallet";

    try {
      if (onchainBetEscrowEnabled && runtimeBetEscrowAddress) {
        workflowStep = "awaiting_wallet";
        preparedWallet = await prepareStakeWallet(market);
        workflowStep = "stake_intent";
        intentId = await createStakeIntent({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: preparedWallet.walletAddress,
          walletProvider: preparedWallet.walletProvider,
          walletType: preparedWallet.walletType,
        });

        pendingRecovery = {
          intentId,
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: preparedWallet.walletAddress,
          stakeTxHash: null,
          walletProvider: preparedWallet.walletProvider,
          walletType: preparedWallet.walletType,
          browserInfo:
            typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
          routePath: "/bets",
          updatedAt: new Date().toISOString(),
        };
        savePendingStakeRecovery(pendingRecovery);
      }

      workflowStep =
        onchainBetEscrowEnabled && runtimeBetEscrowAddress ? "confirming_chain" : "lock_wager";
      const stakeExecution = await lockStakeOnChain(market, selection.stake, preparedWallet);
      if (pendingRecovery) {
        pendingRecovery = {
          ...pendingRecovery,
          walletAddress: stakeExecution.walletAddress,
          stakeTxHash: stakeExecution.stakeTxHash,
          walletProvider: stakeExecution.walletProvider,
          walletType: stakeExecution.walletType,
          updatedAt: new Date().toISOString(),
        };
        savePendingStakeRecovery(pendingRecovery);
      }

      setLockWorkflow({
        marketId: market.id,
        phase: "recording_wager",
        stakeTxHash: stakeExecution.stakeTxHash,
      });
      workflowStep = "recording_wager";

      if (intentId && pendingRecovery?.stakeTxHash) {
        await recordStakeIntentBroadcast(intentId, pendingRecovery);
      }

      const response = await fetch("/api/bets/wager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: stakeExecution.walletAddress,
          stakeTxHash: stakeExecution.stakeTxHash,
          intentId,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as BetBoardSnapshot & {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "Could not lock the wager.");
      }

      if (intentId) {
        clearPendingStakeRecovery(intentId);
      }
      await refreshBoard(payload);
      setSelection(null);
      if (stakeExecution.executionMode === "onchain_escrow" && stakeExecution.stakeTxHash) {
        toast.success(`Escrow confirmed for ${selection.stake} WOLO on ${selection.side === "left" ? market.left.name : market.right.name}. ${shortTxHash(stakeExecution.stakeTxHash)}`);
      } else {
        toast.success(`Added ${selection.stake} WOLO to ${selection.side === "left" ? market.left.name : market.right.name}.`);
      }
    } catch (error) {
      console.error("Failed to lock wager:", error);
      const rawError = error instanceof Error ? error.message : "Could not lock the wager.";
      if (intentId) {
        await recordStakeIntentFailure({
          intentId,
          walletAddress: pendingRecovery?.walletAddress || connectedWalletAddress || null,
          walletProvider: pendingRecovery?.walletProvider || "keplr",
          walletType: pendingRecovery?.walletType || null,
          step: workflowStep,
          rawError,
          status: pendingRecovery?.stakeTxHash ? "suspect" : "failed",
        });
        if (!pendingRecovery?.stakeTxHash) {
          clearPendingStakeRecovery(intentId);
        }
      } else if (onchainBetEscrowEnabled && runtimeBetEscrowAddress) {
        await recordBetWalletError({
          marketId: market.id,
          side: selection.side,
          amountWolo: selection.stake,
          walletAddress: preparedWallet?.walletAddress || connectedWalletAddress || null,
          walletProvider: preparedWallet?.walletProvider || "keplr",
          walletType: preparedWallet?.walletType || null,
          step: workflowStep,
          rawError,
        });
      }
      toast.error(rawError);
    } finally {
      setWorkingKey(null);
      setLockWorkflow(null);
    }
  }

  async function handleClear(marketId: number) {
    if (!requireSignIn()) return;

    const market = board?.openMarkets.find((entry) => entry.id === marketId) || null;
    if (market && isOnchainViewerWager(market.viewerWager)) {
      toast.error("Escrowed WOLO slips cannot be cleared from the app.");
      return;
    }

    setWorkingKey(`clear-${marketId}`);
    try {
      const response = await fetch(`/api/bets/wager?marketId=${marketId}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as BetBoardSnapshot & {
        detail?: string;
      };
      if (!response.ok) {
        throw new Error(payload.detail || "Could not clear the wager.");
      }
      await refreshBoard(payload);
      if (selection?.marketId === marketId) {
        setSelection(null);
      }
      toast.success("Slip cleared.");
    } catch (error) {
      console.error("Failed to clear wager:", error);
      toast.error(error instanceof Error ? error.message : "Could not clear the wager.");
    } finally {
      setWorkingKey(null);
    }
  }

  const viewerName = board?.viewerName || user?.inGameName || user?.steamPersonaName || "Your book";
  const latestResult = recentResults[0] ?? null;
  const broadcastSurface = useMemo(() => {
    if (spotlightMarket) {
      return {
        key: `market-${spotlightMarket.id}`,
        leftName: safePlayerName(spotlightMarket.left.name, "Player 1"),
        rightName: safePlayerName(spotlightMarket.right.name, "Player 2"),
        marketTitle: spotlightMarket.title,
        eventLabel: spotlightMarket.eventLabel,
        settled: false,
        feeds: spotlightMarket.broadcastFeeds ?? EMPTY_BROADCAST_FEEDS,
        previews: spotlightMarket.broadcastPreviewUrls ?? EMPTY_BROADCAST_PREVIEW_URLS,
      };
    }

    if (latestResult) {
      const resultPlayers = splitMatchTitle(latestResult.title);

      return {
        key: `result-${latestResult.id}`,
        leftName: resultPlayers.leftName,
        rightName: resultPlayers.rightName,
        marketTitle: latestResult.title,
        eventLabel: latestResult.eventLabel,
        settled: true,
        feeds: latestResult.broadcastFeeds ?? EMPTY_BROADCAST_FEEDS,
        previews: latestResult.broadcastPreviewUrls ?? EMPTY_BROADCAST_PREVIEW_URLS,
      };
    }

    return {
      key: "broadcast-empty",
      leftName: "Player 1",
      rightName: "Player 2",
      marketTitle: "Broadcast arming",
      eventLabel: "Waiting for the next book",
      settled: false,
      feeds: EMPTY_BROADCAST_FEEDS,
      previews: EMPTY_BROADCAST_PREVIEW_URLS,
    };
  }, [latestResult, spotlightMarket]);

  useEffect(() => {
    setBroadcastVisible(true);
  }, [broadcastSurface.key]);

  return (
    <main className="space-y-5 overflow-x-hidden py-4 text-white sm:space-y-6 sm:py-5">
      <BroadcastHeroTile
        key={broadcastSurface.key}
        leftName={broadcastSurface.leftName}
        rightName={broadcastSurface.rightName}
        marketTitle={broadcastSurface.marketTitle}
        eventLabel={broadcastSurface.eventLabel}
        settled={broadcastSurface.settled}
        feeds={broadcastSurface.feeds}
        previews={broadcastSurface.previews}
        visible={broadcastVisible}
        onToggle={() => setBroadcastVisible((current) => !current)}
      />

      {betsView === "basic" ? (
        <>
          <section className="grid gap-5 xl:grid-cols-[0.84fr_1.16fr]">
            <div className={`${shellClass()} p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-amber-200/12 bg-amber-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.28em] text-amber-100">
                    Bets
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {openCount} books
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {liveCount} live
                  </span>
                </div>

                <BetsViewToggle value={betsView} onChange={setBetsView} />
              </div>

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-[0.38em] text-slate-400">The War Book</div>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Bets
                </h1>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
                <MiniMetric label="Open" value={String(openCount)} />
                <MiniMetric label="In Play" value={String(liveCount)} />
                <MiniMetric label="Book Pot" value={`${formatExactWolo(totalBookPot || 0)} WOLO`} />
                <MiniMetric
                  label="Your Slips"
                  value={isAuthenticated ? String(board?.yourBook.activeCount || 0) : "Sign in"}
                />
              </div>

              <div className={`mt-4 ${insetClass()} px-3 py-3 sm:mt-5 sm:px-4 sm:py-4`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Your Book</div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">{viewerName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">If Right</div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">
                      {isAuthenticated
                        ? `${formatCompact(board?.yourBook.projectedReturnWolo || 0)} WOLO`
                        : "Open"}
                    </div>
                  </div>
                </div>
              </div>

              {runtimeBetEscrowConfigError ? (
                <div
                  className={`mt-4 ${insetClass()} border-rose-300/15 bg-rose-500/[0.08] px-4 py-4 text-sm text-rose-100`}
                >
                  {runtimeBetEscrowConfigError}
                </div>
              ) : null}
            </div>

            <section className={`${shellClass()} relative overflow-hidden p-5 sm:p-6`}>
              <div className="pointer-events-none absolute right-[-1.25rem] top-[-1.25rem] opacity-[0.08]">
                <Image
                  src={WOLO_LOGO_SRC}
                  alt=""
                  width={260}
                  height={265}
                  className="h-[12rem] w-[12rem] object-contain sm:h-[14rem] sm:w-[14rem]"
                />
              </div>

              {loadingBoard ? (
                <LoadingMarket />
              ) : spotlightMarket ? (
                <MarketFeature
                  market={spotlightMarket}
                  eyebrowLabel={spotlightMarket.featured ? "Featured Market" : "Current Book"}
                  detailMode="basic"
                  selection={selection}
                  workingKey={workingKey}
                  lockWorkflow={lockWorkflow}
                  nowMs={nowMs}
                  isAuthenticated={isAuthenticated}
                  isAdmin={isAdmin}
                  loadingAuth={loading}
                  maxStakeWolo={maxStakeWolo}
                  onSelect={handleSelect}
                  onStakeChange={(stake) =>
                    setSelection((current) =>
                      current && current.marketId === spotlightMarket.id ? { ...current, stake } : current
                    )
                  }
                  onLock={() => handleLock(spotlightMarket)}
                  onClear={() => handleClear(spotlightMarket.id)}
                  onOpenFounderBonus={openFounderComposer}
                />
              ) : recentResults.length ? (
                <RecentResultFeature result={recentResults[0]} />
              ) : (
                <EmptyShell label="No books armed yet. The first live or settled book will land here." />
              )}
            </section>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.04fr_0.96fr]">
            <RecentBetsSection results={recentResults} />

            <YourBookSection
              board={board}
              isAuthenticated={isAuthenticated}
              loadingAuth={loading}
              loginWithSteam={loginWithSteam}
              unresolvedStakeIntents={unresolvedStakeIntents}
              pendingStakeRecoveries={pendingStakeRecoveries}
              recoveringIntentId={recoveringIntentId}
              onRecover={recoverStakeIntent}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.98fr_1.02fr]">
            <OpenBooksSection
              eyebrow={spotlightMarket ? "More Open Books" : "Open Books"}
              title={spotlightMarket ? "Keep the page alive without crowding it." : "Pick a side."}
              detailMode="basic"
              markets={openMarkets}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              nowMs={nowMs}
              isAdmin={isAdmin}
              maxStakeWolo={maxStakeWolo}
              onSelect={handleSelect}
              onStakeChange={(marketId, stake) =>
                setSelection((current) =>
                  current && current.marketId === marketId ? { ...current, stake } : current
                )
              }
              onLock={handleLock}
              onClear={handleClear}
              onOpenFounderBonus={openFounderComposer}
              loadingBoard={loadingBoard}
              limit={2}
              emptyLabel={
                recentResults.length
                  ? "No extra open books right now. Recent settled books are carrying the page until the next one arms."
                  : "No open books right now. The first live book will show up here."
              }
              footerNote={
                openMarkets.length > 2
                  ? `${openMarkets.length - 2} more book${openMarkets.length - 2 === 1 ? "" : "s"} waiting in Advanced view.`
                  : null
              }
            />

            <BoardPulseSection
              openCount={openCount}
              liveCount={liveCount}
              bestReturnMultiplier={board?.heat.bestReturn?.returnMultiplier ?? null}
              biggestPotLabel={board?.heat.biggestPot?.label || "Market arming"}
              biggestPotWolo={board?.heat.biggestPot?.potWolo ?? null}
              latestResult={recentResults[0] ?? null}
            />
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-[0.78fr_1.22fr]">
            <div className={`${shellClass()} p-5 sm:p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-amber-200/12 bg-amber-400/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.28em] text-amber-100">
                    Bets
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {openCount} books
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-slate-300">
                    {liveCount} live
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                      onchainBetEscrowRequired && onchainBetEscrowEnabled
                        ? "border border-cyan-300/20 bg-cyan-400/10 text-cyan-100"
                        : onchainBetEscrowRequired
                          ? "border border-rose-300/20 bg-rose-400/10 text-rose-100"
                          : onchainBetEscrowEnabled
                            ? "border border-amber-300/20 bg-amber-400/10 text-amber-100"
                            : "border border-white/[0.08] bg-white/[0.04] text-slate-300"
                    }`}
                  >
                    {onchainBetEscrowRequired && onchainBetEscrowEnabled
                      ? "verified escrow required"
                      : onchainBetEscrowRequired
                        ? "escrow required"
                        : runtimeBetEscrowMode === "optional" && onchainBetEscrowEnabled
                          ? "escrow optional"
                          : "app-side fallback"}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${groupedSettlementTone(groupedRunCapability)}`}
                  >
                    {groupedSettlementLabel(groupedRunCapability)}
                  </span>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                    {settlementExecutionMode === "settlement_service"
                      ? "chain rail active"
                      : settlementExecutionMode === "local_signer_fallback"
                        ? "local signer fallback"
                        : "chain rail pending"}
                  </span>
                </div>

                <BetsViewToggle value={betsView} onChange={setBetsView} />
              </div>

              <div className="mt-5">
                <div className="text-[11px] uppercase tracking-[0.38em] text-slate-400">The War Book</div>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                  Bets
                </h1>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
                <MiniMetric label="Open" value={String(openCount)} />
                <MiniMetric label="In Play" value={String(liveCount)} />
                <MiniMetric label="Book Pot" value={`${formatExactWolo(totalBookPot || 0)} WOLO`} />
                <MiniMetric
                  label="Your Slips"
                  value={isAuthenticated ? String(board?.yourBook.activeCount || 0) : "Sign in"}
                />
              </div>

              <div className={`mt-4 ${insetClass()} px-3 py-3 sm:mt-5 sm:px-4 sm:py-4`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Your Book</div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">{viewerName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">If Right</div>
                    <div className="mt-2 text-base font-semibold text-white sm:text-lg">
                      {isAuthenticated
                        ? `${formatCompact(board?.yourBook.projectedReturnWolo || 0)} WOLO`
                        : "Open"}
                    </div>
                  </div>
                </div>
              </div>

              {runtimeBetTestMode ? (
                <div className={`mt-4 ${insetClass()} px-4 py-4 text-sm text-slate-300`}>
                  Testing mode keeps the book open until official result or finalization. Same wallet,
                  same side only for now.
                </div>
              ) : null}

              {runtimeBetEscrowConfigError ? (
                <div className={`mt-4 ${insetClass()} border-rose-300/15 bg-rose-500/[0.08] px-4 py-4 text-sm text-rose-100`}>
                  {runtimeBetEscrowConfigError}
                </div>
              ) : null}
              {settlementSurfaceDetail ? (
                <div className={`mt-4 ${insetClass()} px-4 py-4 text-sm text-slate-300`}>
                  {settlementSurfaceDetail}
                </div>
              ) : null}
              {settlementSurfaceWarnings.length ? (
                <div className="mt-4 space-y-2">
                  {settlementSurfaceWarnings.map((warning, index) => (
                    <div
                      key={`${warning}-${index}`}
                      className={`${insetClass()} border-amber-300/15 bg-amber-500/[0.08] px-4 py-4 text-sm text-amber-100`}
                    >
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <section className={`${shellClass()} relative overflow-hidden p-5 sm:p-6`}>
              <div className="pointer-events-none absolute right-[-1.25rem] top-[-1.25rem] opacity-[0.08]">
                <Image
                  src={WOLO_LOGO_SRC}
                  alt=""
                  width={260}
                  height={265}
                  className="h-[12rem] w-[12rem] object-contain sm:h-[14rem] sm:w-[14rem]"
                />
              </div>

              {loadingBoard ? (
                <LoadingMarket />
              ) : spotlightMarket ? (
                <MarketFeature
                  market={spotlightMarket}
                  eyebrowLabel={spotlightMarket.featured ? "Featured Market" : "Current Book"}
                  detailMode="advanced"
                  selection={selection}
                  workingKey={workingKey}
                  lockWorkflow={lockWorkflow}
                  nowMs={nowMs}
                  isAuthenticated={isAuthenticated}
                  isAdmin={isAdmin}
                  loadingAuth={loading}
                  maxStakeWolo={maxStakeWolo}
                  onSelect={handleSelect}
                  onStakeChange={(stake) =>
                    setSelection((current) =>
                      current && current.marketId === spotlightMarket.id ? { ...current, stake } : current
                    )
                  }
                  onLock={() => handleLock(spotlightMarket)}
                  onClear={() => handleClear(spotlightMarket.id)}
                  onOpenFounderBonus={openFounderComposer}
                />
              ) : (
                <EmptyShell label="No books armed yet." />
              )}
            </section>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
            <OpenBooksSection
              eyebrow="Open Books"
              title="Pick a side."
              detailMode="advanced"
              markets={openMarkets}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              nowMs={nowMs}
              isAdmin={isAdmin}
              maxStakeWolo={maxStakeWolo}
              onSelect={handleSelect}
              onStakeChange={(marketId, stake) =>
                setSelection((current) =>
                  current && current.marketId === marketId ? { ...current, stake } : current
                )
              }
              onLock={handleLock}
              onClear={handleClear}
              onOpenFounderBonus={openFounderComposer}
              loadingBoard={loadingBoard}
              limit={null}
              emptyLabel="No open books right now."
            />

            <div className="space-y-5">
              <YourBookSection
                board={board}
                isAuthenticated={isAuthenticated}
                loadingAuth={loading}
                loginWithSteam={loginWithSteam}
                unresolvedStakeIntents={unresolvedStakeIntents}
                pendingStakeRecoveries={pendingStakeRecoveries}
                recoveringIntentId={recoveringIntentId}
                onRecover={recoverStakeIntent}
              />

              <SettledSection results={recentResults} />
              <HeatSection board={board} />
            </div>
          </section>
        </>
      )}

      <FounderBonusModal
        open={Boolean(founderComposer)}
        marketTitle={founderComposer?.marketTitle || "Market"}
        bonusType={founderComposer?.bonusType || "participants"}
        amountValue={founderComposer?.amountValue || ""}
        noteValue={founderComposer?.noteValue || ""}
        saving={savingFounderBonus}
        error={founderBonusError}
        onClose={() => {
          if (savingFounderBonus) {
            return;
          }
          setFounderComposer(null);
          setFounderBonusError(null);
        }}
        onBonusTypeChange={(value) =>
          setFounderComposer((current) =>
            current
              ? {
                  ...current,
                  bonusType: value,
                  amountValue: value === "participants" ? "200" : current.amountValue || "300",
                }
              : current
          )
        }
        onAmountChange={(value) =>
          setFounderComposer((current) =>
            current
              ? {
                  ...current,
                  amountValue: value,
                }
              : current
          )
        }
        onNoteChange={(value) =>
          setFounderComposer((current) =>
            current
              ? {
                  ...current,
                  noteValue: value,
                }
              : current
          )
        }
        onSubmit={() => {
          void submitFounderBonus();
        }}
      />
    </main>
  );
}

function OpenBooksSection({
  eyebrow,
  title,
  detailMode = "advanced",
  markets,
  selection,
  workingKey,
  lockWorkflow,
  nowMs,
  isAdmin,
  maxStakeWolo,
  onSelect,
  onStakeChange,
  onLock,
  onClear,
  onOpenFounderBonus,
  loadingBoard,
  limit,
  emptyLabel,
  footerNote,
}: {
  eyebrow: string;
  title: string;
  detailMode?: "basic" | "advanced";
  markets: BetBoardMarket[];
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  nowMs: number;
  isAdmin: boolean;
  maxStakeWolo: number;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onStakeChange: (marketId: number, stake: number) => void;
  onLock: (market: BetBoardMarket) => void;
  onClear: (marketId: number) => void;
  onOpenFounderBonus: (market: BetBoardMarket, bonusType: FounderBonusType) => void;
  loadingBoard: boolean;
  limit: number | null;
  emptyLabel: string;
  footerNote?: string | null;
}) {
  const visibleMarkets = limit ? markets.slice(0, limit) : markets;

  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">{eyebrow}</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {markets.length}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {loadingBoard ? (
          <>
            <LoadingCard />
            <LoadingCard />
          </>
        ) : visibleMarkets.length > 0 ? (
          visibleMarkets.map((market, index) => (
            <MarketCard
              key={market.id}
              market={market}
              detailMode={detailMode}
              selection={selection}
              workingKey={workingKey}
              lockWorkflow={lockWorkflow}
              nowMs={nowMs}
              isAdmin={isAdmin}
              maxStakeWolo={maxStakeWolo}
              onSelect={onSelect}
              onStakeChange={(stake) => onStakeChange(market.id, stake)}
              onLock={() => onLock(market)}
              onClear={() => onClear(market.id)}
              onOpenFounderBonus={onOpenFounderBonus}
              accent={index % 2 === 0 ? "warm" : "cool"}
            />
          ))
        ) : (
          <EmptyShell label={emptyLabel} />
        )}
      </div>

      {footerNote ? (
        <div className="mt-4 text-sm text-slate-400">{footerNote}</div>
      ) : null}
    </section>
  );
}

function RecentBetsSection({ results }: { results: BetSettledResult[] }) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Recent Bets</div>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {results.length}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {results.length ? (
          results
            .slice(0, 6)
            .map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                compact
                basicLook
                founderChipVariant="micro"
              />
            ))
        ) : (
          <EmptyShell label="No books have settled yet. The first closed result will show up here instead of leaving Basic empty." />
        )}
      </div>
    </section>
  );
}

function SettledSection({ results }: { results: BetSettledResult[] }) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Payout Proof</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Settled</h2>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          {results.length}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {results.length ? (
          results.map((result) => <ResultCard key={result.id} result={result} />)
        ) : (
          <EmptyShell label="No proof landed yet." />
        )}
      </div>
    </section>
  );
}

function BoardPulseSection({
  openCount,
  liveCount,
  biggestPotLabel,
  biggestPotWolo,
  bestReturnMultiplier,
  latestResult,
}: {
  openCount: number;
  liveCount: number;
  biggestPotLabel: string;
  biggestPotWolo: number | null;
  bestReturnMultiplier: number | null;
  latestResult: BetSettledResult | null;
}) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Board Pulse</div>
      <h2 className="mt-2 text-2xl font-semibold text-white"></h2>

      <div className="mt-5 space-y-3">
        <HeatRow
          label="Open books"
          value={openCount > 0 ? `${openCount} book${openCount === 1 ? "" : "s"} armed` : "Quiet for now"}
          detail={liveCount > 0 ? `${liveCount} currently live` : "No live book at this second"}
        />
        <HeatRow
          label="Biggest pot"
          value={biggestPotLabel}
          detail={biggestPotWolo ? `${formatExactWolo(biggestPotWolo)} WOLO` : "Waiting for the next crowd surge"}
        />
        <HeatRow
          label="Best return"
          value={bestReturnMultiplier ? `${bestReturnMultiplier.toFixed(2)}x right now` : "Reading the board"}
          detail={
            latestResult
              ? `${latestResult.winner} closed the latest book · ${formatSettledTime(latestResult.settledAt)}`
              : "No closed proof yet"
          }
        />
      </div>
    </section>
  );
}

function HeatSection({ board }: { board: BetBoardSnapshot | null }) {
  return (
    <section className={`${shellClass()} p-5 sm:p-6`}>
      <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Heat</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">What’s moving.</h2>

      <div className="mt-5 space-y-3">
        <HeatRow
          label="Biggest pot"
          value={board?.heat.biggestPot?.label || "Market arming"}
          detail={
            board?.heat.biggestPot
              ? `${formatExactWolo(board.heat.biggestPot.potWolo)} WOLO`
              : "Quiet"
          }
        />
        <HeatRow
          label="Best return"
          value={board?.heat.bestReturn?.label || "Reading the board"}
          detail={
            board?.heat.bestReturn
              ? `${board.heat.bestReturn.returnMultiplier.toFixed(2)}x`
              : "Waiting"
          }
        />
        <HeatRow
          label="Latest proof"
          value={board?.settledResults[0]?.title || "No result yet"}
          detail={
            board?.settledResults[0]
              ? `${board.settledResults[0].winner} · ${formatSettledTime(board.settledResults[0].settledAt)}`
              : "Pending"
          }
        />
      </div>
    </section>
  );
}

function RecentResultFeature({ result }: { result: BetSettledResult }) {
  return (
    <div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Latest Closed Book</div>
        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          {result.title}
        </h2>
        <div className="mt-2 text-sm text-slate-400">
          {result.winner} took {result.mapName} · {formatSettledTime(result.settledAt)}
        </div>
      </div>

      <div className="mt-5">
        <ResultCard result={result} basicLook founderChipVariant="micro" />
      </div>
    </div>
  );
}

function BroadcastVisibilityButton({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const Icon = visible ? Monitor : MonitorOff;

  return (
    <button
      type="button"
      aria-pressed={visible}
      aria-label={visible ? "Hide Broadcast" : "Show Broadcast"}
      title={visible ? "Hide Broadcast" : "Show Broadcast"}
      onClick={onToggle}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
        visible
          ? "bg-amber-300/12 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.08)] hover:bg-amber-300/18"
          : "bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

function providerLabel(feed: BroadcastFeed | null | undefined) {
  if (!feed) return "Placeholder";
  if (feed.provider === "twitch") return "Twitch";
  if (feed.provider === "youtube") return "YouTube";
  if (feed.provider === "steam") return "Steam";
  if (feed.provider === "discord") return "Discord";
  return "External";
}

function buildBroadcastEmbedSrc(
  feed: BroadcastFeed | null | undefined,
  browserHost: string,
  options: { compact?: boolean; autoplay?: boolean } = {}
) {
  if (!feed?.embedId || !feed.canEmbed) {
    return null;
  }

  const compact = Boolean(options.compact);
  const autoplay = Boolean(options.autoplay);

  if (feed.provider === "twitch") {
    const parent = encodeURIComponent(browserHost || "aoe2hdbets.com");
    return `https://player.twitch.tv/?channel=${encodeURIComponent(
      feed.embedId
    )}&parent=${parent}&autoplay=${autoplay ? "true" : "false"}&muted=${
      compact || autoplay ? "true" : "false"
    }`;
  }

  if (feed.provider === "youtube") {
    return `https://www.youtube.com/embed/${encodeURIComponent(
      feed.embedId
    )}?rel=0&modestbranding=1&autoplay=${autoplay ? "1" : "0"}`;
  }

  return null;
}

function BroadcastHeroTile({
  leftName,
  rightName,
  marketTitle,
  eventLabel,
  settled = false,
  feeds,
  previews,
  visible,
  onToggle,
}: {
  leftName: string;
  rightName: string;
  marketTitle: string;
  eventLabel: string;
  settled?: boolean;
  feeds: BroadcastFeeds;
  previews: BroadcastPreviewUrls;
  visible: boolean;
  onToggle: () => void;
}) {
  const [selectedView, setSelectedView] = useState<BroadcastViewKey>("god");
  const [playingView, setPlayingView] = useState<BroadcastViewKey | null>(null);
  const [browserHost, setBrowserHost] = useState("aoe2hdbets.com");
  const leftPreviewUrl =
    previews.left || (sameBroadcastSource(feeds.left, feeds.god) ? previews.god : null);
  const rightPreviewUrl =
    previews.right || (sameBroadcastSource(feeds.right, feeds.god) ? previews.god : null);
  const views = useMemo(
    () =>
      [
        {
          key: "left" as const,
          label: safePlayerName(leftName, "Player 1"),
          eyebrow: "Player cam",
          tone: "warm" as const,
          feed: feeds.left,
          previewUrl: leftPreviewUrl,
        },
        {
          key: "god" as const,
          label: "God View",
          eyebrow: "Observer",
          tone: "gold" as const,
          feed: feeds.god,
          previewUrl: previews.god,
        },
        {
          key: "right" as const,
          label: safePlayerName(rightName, "Player 2"),
          eyebrow: "Player cam",
          tone: "cool" as const,
          feed: feeds.right,
          previewUrl: rightPreviewUrl,
        },
      ],
    [feeds, leftName, leftPreviewUrl, previews.god, rightName, rightPreviewUrl]
  );
  const activeView = views.find((view) => view.key === selectedView) || views[1];

  useEffect(() => {
    setBrowserHost(window.location.hostname || "aoe2hdbets.com");
  }, []);

  useEffect(() => {
    setSelectedView("god");
    setPlayingView(null);
  }, [marketTitle, leftName, rightName]);

  return (
    <section
      data-testid="broadcast-hero-tile"
      className={`${shellClass()} overflow-hidden border-amber-200/10 bg-[radial-gradient(circle_at_14%_0%,rgba(251,191,36,0.14),transparent_30%),radial-gradient(circle_at_86%_14%,rgba(56,189,248,0.11),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.48))] p-4 sm:p-5 lg:p-6`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.32em] text-amber-100/70">
            Broadcast
          </div>
          <h2 className="mt-2 truncate text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl lg:text-4xl">
            {activeView.label}
          </h2>
          <div className="mt-2 text-sm text-slate-400">
            {activeView.feed
              ? `${providerLabel(activeView.feed)} feed`
              : settled
                ? "Replay camera placeholder"
                : "Live camera placeholder"} · {eventLabel}
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-2">
          <span className="max-w-[14rem] truncate rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-300 sm:max-w-[22rem]">
            {marketTitle}
          </span>
          <BroadcastVisibilityButton visible={visible} onToggle={onToggle} />
        </div>
      </div>

      {visible ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {views.map((view) => (
              <BroadcastPreviewButton
                key={view.key}
                label={view.label}
                eyebrow={view.eyebrow}
                tone={view.tone}
                feed={view.feed}
                previewUrl={view.previewUrl}
                selected={selectedView === view.key}
                onSelect={() => {
                  setSelectedView(view.key);
                  setPlayingView(null);
                }}
              />
            ))}
          </div>

          <BroadcastPlaceholderFrame
            label={activeView.label}
            eyebrow={activeView.eyebrow}
            tone={activeView.tone}
            feed={activeView.feed}
            previewUrl={activeView.previewUrl}
            browserHost={browserHost}
            marketTitle={marketTitle}
            isPlaying={playingView === activeView.key}
            onPlay={() => setPlayingView(activeView.key)}
          />
        </>
      ) : (
        <div className={`${insetClass()} mt-4 px-4 py-5 text-sm text-slate-300`}>
          Broadcast hidden.
        </div>
      )}
    </section>
  );
}

function BroadcastPreviewButton({
  label,
  eyebrow,
  tone,
  feed,
  previewUrl,
  selected,
  onSelect,
}: {
  label: string;
  eyebrow: string;
  tone: "warm" | "gold" | "cool";
  feed: BroadcastFeed | null;
  previewUrl: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group min-w-0 overflow-hidden rounded-[1.05rem] border p-1.5 text-left transition sm:rounded-[1.2rem] sm:p-2 ${
        selected
          ? "border-amber-100/45 bg-amber-300/10 shadow-[0_0_30px_rgba(251,191,36,0.10)]"
          : "border-white/[0.06] bg-white/[0.035] hover:border-white/14 hover:bg-white/[0.055]"
      }`}
    >
      <div className="aspect-video overflow-hidden rounded-[0.85rem] border border-white/[0.06] bg-slate-950/80 sm:rounded-[0.95rem]">
        <BroadcastSignalSurface
          tone={tone}
          feed={feed}
          previewUrl={previewUrl}
          compact
        />
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-[9px] uppercase tracking-[0.18em] text-slate-500 sm:text-[10px] sm:tracking-[0.22em]">
          {feed ? providerLabel(feed) : eyebrow}
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-white sm:text-sm">{label}</div>
      </div>
    </button>
  );
}

function BroadcastPlaceholderFrame({
  label,
  eyebrow,
  tone,
  feed,
  previewUrl,
  browserHost,
  marketTitle,
  isPlaying,
  onPlay,
}: {
  label: string;
  eyebrow: string;
  tone: "warm" | "gold" | "cool";
  feed: BroadcastFeed | null;
  previewUrl: string | null;
  browserHost: string;
  marketTitle: string;
  isPlaying: boolean;
  onPlay: () => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-[1.45rem] border border-white/[0.08] bg-slate-950/78 p-2.5 sm:p-3">
      <div className="aspect-video min-h-[12rem] overflow-hidden rounded-[1.2rem] border border-white/[0.06] bg-black/55 sm:min-h-[15rem]">
        <BroadcastSignalSurface
          tone={tone}
          feed={feed}
          previewUrl={previewUrl}
          browserHost={browserHost}
          isPlaying={isPlaying}
          onPlay={onPlay}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
            {feed ? providerLabel(feed) : eyebrow}
          </div>
          <div className="mt-1 truncate text-lg font-semibold text-white sm:text-xl">{label}</div>
        </div>
        {feed ? (
          <a
            href={feed.url}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 max-w-full overflow-hidden flex items-center gap-2 rounded-full border border-emerald-200/12 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:bg-emerald-400/16 sm:max-w-[24rem]"
          >
            <Play className="h-3.5 w-3.5 text-emerald-100" aria-hidden="true" />
            <span className="truncate">{providerLabel(feed)} feed · {feed.label}</span>
          </a>
        ) : (
          <div className="min-w-0 max-w-full overflow-hidden flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 sm:max-w-[24rem]">
            <Play className="h-3.5 w-3.5 text-amber-100" aria-hidden="true" />
            <span className="truncate">Placeholder feed · {marketTitle}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function BroadcastSignalSurface({
  tone,
  feed,
  previewUrl,
  browserHost,
  compact = false,
  isPlaying = false,
  onPlay,
}: {
  tone: "warm" | "gold" | "cool";
  feed?: BroadcastFeed | null;
  previewUrl?: string | null;
  browserHost?: string;
  compact?: boolean;
  isPlaying?: boolean;
  onPlay?: () => void;
}) {
  const [loopReady, setLoopReady] = useState(false);
  const [loopFailed, setLoopFailed] = useState(false);
  const embedSrc = isPlaying
    ? buildBroadcastEmbedSrc(feed, browserHost || "aoe2hdbets.com", {
        compact,
        autoplay: true,
      })
    : null;
  const hasLoop = Boolean(previewUrl) && !isPlaying && !loopFailed;
  const hasEmbeddableFeed = Boolean(feed?.canEmbed && feed.embedId);
  const hasExternalFeed = Boolean(feed && !hasEmbeddableFeed);
  const glowClassName =
    tone === "warm"
      ? "from-amber-300/24 via-orange-500/12 to-transparent"
      : tone === "cool"
        ? "from-sky-300/22 via-cyan-500/12 to-transparent"
        : "from-emerald-300/20 via-amber-300/12 to-transparent";

  useEffect(() => {
    setLoopReady(false);
    setLoopFailed(false);
  }, [previewUrl, isPlaying]);

  return (
    <div className="relative isolate flex h-full min-h-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_34%_28%,rgba(56,189,248,0.18),transparent_32%),radial-gradient(circle_at_72%_42%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,#020617,#050816_48%,#0f172a)]">
      {hasLoop ? (
        <video
          key={previewUrl}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            loopReady ? "opacity-100" : "opacity-0"
          }`}
          src={previewUrl || undefined}
          muted
          autoPlay
          loop
          playsInline
          preload={compact ? "metadata" : "auto"}
          onLoadedData={() => {
            setLoopReady(true);
            setLoopFailed(false);
          }}
          onCanPlay={() => {
            setLoopReady(true);
            setLoopFailed(false);
          }}
          onError={() => {
            setLoopReady(false);
            setLoopFailed(true);
          }}
        />
      ) : null}

      {embedSrc ? (
        <iframe
          src={embedSrc}
          title={feed?.label || "Broadcast feed"}
          className={`absolute inset-0 z-20 h-full w-full border-0 ${
            compact ? "pointer-events-none" : ""
          }`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : null}

      {!embedSrc ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.055),transparent_36%,rgba(255,255,255,0.035))]" />
          <div
            className={`pointer-events-none absolute inset-x-[-15%] top-[-30%] h-[76%] rounded-full bg-gradient-to-b ${glowClassName} blur-3xl`}
          />
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_12px)] opacity-50" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/78 via-black/10 to-black/24" />
        </>
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 z-30 flex items-center gap-2 sm:left-4 sm:top-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-30" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
        </span>
        {compact ? null : (
          <span className="text-[9px] uppercase tracking-[0.18em] text-white/52 sm:text-[10px] sm:tracking-[0.22em]">
            {feed ? `${providerLabel(feed)} feed` : "No stream wired"}
          </span>
        )}
      </div>

      {!embedSrc && !compact && hasEmbeddableFeed ? (
        <button
          type="button"
          onClick={onPlay}
          className="absolute left-1/2 top-1/2 z-40 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-2xl backdrop-blur-md transition duration-200 hover:scale-105 hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label={`Play ${feed?.label || "Broadcast feed"}`}
        >
          <span className="ml-1 block h-0 w-0 border-y-[16px] border-l-[25px] border-y-transparent border-l-white" />
        </button>
      ) : null}

      {!embedSrc && !compact && hasExternalFeed ? (
        <a
          href={feed?.url}
          target="_blank"
          rel="noreferrer"
          className="absolute left-1/2 top-1/2 z-40 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-2xl backdrop-blur-md transition duration-200 hover:scale-105 hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-sky-300"
          aria-label={`Open ${feed?.label || "Broadcast feed"}`}
        >
          <span className="ml-1 block h-0 w-0 border-y-[16px] border-l-[25px] border-y-transparent border-l-white" />
        </a>
      ) : null}

      {!embedSrc && (!hasLoop || !loopReady) ? (
        <div className="relative z-10 flex flex-col items-center gap-3 text-white/70">
          <Monitor
            className={`${compact ? "h-7 w-7 sm:h-8 sm:w-8" : "h-14 w-14"} text-white/70`}
            aria-hidden="true"
          />
          {feed && !compact && !hasEmbeddableFeed ? (
            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70">
              External feed saved
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StakeAmountRail({
  activeSelection,
  canEdit,
  maxStakeWolo,
  onStakeChange,
}: {
  activeSelection: SelectionState | null;
  canEdit: boolean;
  maxStakeWolo: number;
  onStakeChange: (stake: number) => void;
}) {
  const [customDraft, setCustomDraft] = useState("");
  const stakeError =
    activeSelection ? validateStakeAmount(activeSelection.stake, maxStakeWolo) : null;

  const hasActiveSelection = Boolean(activeSelection);

  useEffect(() => {
    if (!hasActiveSelection) {
      setCustomDraft("");
      return;
    }

    // New side / new market selection should feel clean.
    // Keep the suggested stake highlighted via the pills,
    // but do not jam it into the custom input automatically.
    setCustomDraft("");
  }, [hasActiveSelection, activeSelection?.marketId, activeSelection?.side]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {STAKE_OPTIONS.map((stake) => (
            <button
              key={stake}
              type="button"
              onClick={() => {
                if (!activeSelection) return;
                setCustomDraft(String(stake));
                onStakeChange(stake);
              }}
              disabled={!activeSelection || !canEdit}
              className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm transition ${
                activeSelection?.stake === stake ? edgeButton("gold") : edgeButton("glass")
              } ${!activeSelection || !canEdit ? "cursor-not-allowed opacity-50" : ""}`}
            >
              {stake}
            </button>
          ))}
          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[11px] uppercase tracking-[0.22em] text-slate-400">
            Custom
          </span>
        </div>

        <label className="flex min-w-[11rem] items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-2 transition focus-within:border-amber-200/30 focus-within:bg-white/[0.065]">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={activeSelection ? customDraft : ""}
            onChange={(event) => {
              if (!activeSelection) return;
              const digits = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
              setCustomDraft(digits);
              onStakeChange(digits ? Number.parseInt(digits, 10) : 0);
            }}
            disabled={!activeSelection || !canEdit}
            className="min-w-0 flex-1 bg-transparent text-right text-sm text-white outline-none placeholder:text-slate-500 disabled:cursor-not-allowed"
            placeholder="Amount"
          />
          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">WOLO</span>
        </label>
      </div>

      {activeSelection ? (
        <div className={`mt-3 text-xs ${stakeError ? "text-rose-200" : "text-slate-400"}`}>
          {stakeError || `Up to ${maxStakeWolo.toLocaleString()} WOLO with the current wallet/app limit.`}
        </div>
      ) : null}
    </>
  );
}

function MarketFeature({
  market,
  eyebrowLabel = "Featured Market",
  detailMode = "advanced",
  selection,
  workingKey,
  lockWorkflow,
  nowMs,
  isAuthenticated,
  isAdmin,
  loadingAuth,
  maxStakeWolo,
  onSelect,
  onStakeChange,
  onLock,
  onClear,
  onOpenFounderBonus,
}: {
  market: BetBoardMarket;
  eyebrowLabel?: string;
  detailMode?: "basic" | "advanced";
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  nowMs: number;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loadingAuth: boolean;
  maxStakeWolo: number;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onStakeChange: (stake: number) => void;
  onLock: () => void;
  onClear: () => void;
  onOpenFounderBonus: (market: BetBoardMarket, bonusType: FounderBonusType) => void;
}) {
  const activeSelection = selection && selection.marketId === market.id ? selection : null;
  const marketWorkflow = lockWorkflow?.marketId === market.id ? lockWorkflow : null;
  const onchainViewerWager = isOnchainViewerWager(market.viewerWager) ? market.viewerWager : null;
  const onchainLocked = Boolean(onchainViewerWager);
  const canEditSlip = !marketWorkflow;
  const lockedSide = market.viewerWager?.side ?? null;
  const displaySide = activeSelection?.side ?? lockedSide;
  const displaySelectedPool = displaySide
    ? displaySide === "left"
      ? market.left.poolWolo
      : market.right.poolWolo
    : 0;
  const displayOppositePool = displaySide
    ? displaySide === "left"
      ? market.right.poolWolo
      : market.left.poolWolo
    : 0;
  const projectedReturn = activeSelection
    ? projectReturn(activeSelection.stake, displaySelectedPool, displayOppositePool)
    : market.viewerWager && displaySide
      ? projectReturn(
          market.viewerWager.amountWolo,
          Math.max(0, displaySelectedPool - market.viewerWager.amountWolo),
          displayOppositePool
        )
      : 0;
  const statusCopy = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Keplr to approve the WOLO stake."
    : marketWorkflow.phase === "confirming_chain"
        ? "Stake submitted. Waiting for chain confirmation."
        : `Escrow confirmed${marketWorkflow.stakeTxHash ? ` · ${shortTxHash(marketWorkflow.stakeTxHash)}` : ""}. Recording slip...`
    : activeSelection
      ? `Adding ${activeSelection.stake} WOLO to ${activeSelection.side === "left" ? market.left.name : market.right.name}`
      : market.viewerWager
        ? `On ${market.viewerWager.side === "left" ? market.left.name : market.right.name} for ${market.viewerWager.amountWolo} WOLO across ${market.viewerWager.slipCount} slips${onchainViewerWager?.stakeTxHash ? ` · ${shortTxHash(onchainViewerWager.stakeTxHash)}` : ""}`
        : isAuthenticated
          ? "Pick a side"
          : loadingAuth
            ? "Loading"
            : "Steam sign-in required";
  const stakeError = activeSelection ? validateStakeAmount(activeSelection.stake, maxStakeWolo) : null;
  const lockLabel = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Open Wallet..."
      : marketWorkflow.phase === "confirming_chain"
        ? "Confirming Chain..."
        : "Recording Slip..."
    : activeSelection
      ? `Add ${activeSelection.stake}`
      : market.viewerWager
        ? "Add More"
        : "Lock";

  return (
    <div className="relative">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-slate-500">{eyebrowLabel}</div>
          {market.href ? (
            <Link
              href={market.href}
              className="mt-2 inline-flex text-3xl font-semibold tracking-[-0.04em] text-white transition hover:text-amber-100 sm:text-4xl"
            >
              {market.title}
            </Link>
          ) : (
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              {market.title}
            </h2>
          )}
          <div className="mt-2 text-sm text-slate-400">{market.eventLabel}</div>
          <FounderBonusChips
            bonuses={market.founderBonuses}
            variant={detailMode === "basic" ? "micro" : "full"}
          />
          <MarketTimingRail market={market} nowMs={nowMs} />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {market.href ? (
            <Link
              href={market.href}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs transition ${edgeButton("glass")}`}
            >
              View Match
            </Link>
          ) : null}
          {isAdmin ? (
            <>
              <button
                type="button"
                onClick={() => onOpenFounderBonus(market, "participants")}
                className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-400/18"
              >
                +FB
              </button>
              <button
                type="button"
                onClick={() => onOpenFounderBonus(market, "winner")}
                className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs text-sky-100 transition hover:bg-sky-400/18"
              >
                +FW
              </button>
            </>
          ) : null}
          <MarketStatusPill market={market} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <SideChoice
          side={market.left}
          selected={displaySide === "left"}
          emphasis="warm"
          disabled={!canEditSlip || Boolean(lockedSide && lockedSide !== "left")}
          onSelect={() => onSelect(market, "left")}
        />

        <div className={`${insetClass()} px-5 py-5 text-center`}>
          <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500" title="Total WOLO already sitting in the book.">
            Pot
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-3xl font-semibold text-white">
            <CoinMark />
            <span>{formatExactWolo(market.totalPotWolo)}</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">{market.left.crowdPercent}% / {market.right.crowdPercent}%</div>
        </div>

        <SideChoice
          side={market.right}
          selected={displaySide === "right"}
          emphasis="cool"
          disabled={!canEditSlip || Boolean(lockedSide && lockedSide !== "right")}
          onSelect={() => onSelect(market, "right")}
        />
      </div>

      <div className={`${insetClass()} mt-5 px-4 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <StakeAmountRail
              activeSelection={activeSelection}
              canEdit={canEditSlip}
              maxStakeWolo={maxStakeWolo}
              onStakeChange={onStakeChange}
            />
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500" title="Projected book return if this side wins right now.">
              If Right
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              {activeSelection ? `${formatCompact(projectedReturn)} WOLO` : "Pick a side"}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className={`text-sm ${stakeError ? "text-rose-200" : "text-slate-400"}`}>
            {stakeError || statusCopy}
          </div>

          <div className="flex flex-wrap gap-2">
            {market.viewerWager && !onchainLocked ? (
              <button
                type="button"
                onClick={onClear}
                disabled={workingKey === `clear-${market.id}`}
                className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm transition ${edgeButton("glass")} ${
                  workingKey === `clear-${market.id}` ? "opacity-60" : ""
                }`}
              >
                {workingKey === `clear-${market.id}` ? "Clearing..." : "Clear"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onLock}
              disabled={!activeSelection || Boolean(stakeError) || !canEditSlip || workingKey === `lock-${market.id}`}
              className={`inline-flex items-center rounded-full px-4 py-2.5 text-sm font-semibold transition ${edgeButton("gold")} ${
                !activeSelection || Boolean(stakeError) || !canEditSlip || workingKey === `lock-${market.id}` ? "opacity-60" : ""
              }`}
            >
              {lockLabel}
            </button>
          </div>
        </div>
      </div>

      {detailMode === "advanced" ? <WarTape rows={market.warTape} /> : null}
    </div>
  );
}

function MarketCard({
  market,
  detailMode = "advanced",
  selection,
  workingKey,
  lockWorkflow,
  nowMs,
  isAdmin,
  maxStakeWolo,
  onSelect,
  onStakeChange,
  onLock,
  onClear,
  onOpenFounderBonus,
  accent,
}: {
  market: BetBoardMarket;
  detailMode?: "basic" | "advanced";
  selection: SelectionState | null;
  workingKey: string | null;
  lockWorkflow: LockWorkflow | null;
  nowMs: number;
  isAdmin: boolean;
  maxStakeWolo: number;
  onSelect: (market: BetBoardMarket, side: BetSide) => void;
  onStakeChange: (stake: number) => void;
  onLock: () => void;
  onClear: () => void;
  onOpenFounderBonus: (market: BetBoardMarket, bonusType: FounderBonusType) => void;
  accent: "warm" | "cool";
}) {
  const activeSelection = selection && selection.marketId === market.id ? selection : null;
  const marketWorkflow = lockWorkflow?.marketId === market.id ? lockWorkflow : null;
  const onchainViewerWager = isOnchainViewerWager(market.viewerWager) ? market.viewerWager : null;
  const onchainLocked = Boolean(onchainViewerWager);
  const canEditSlip = !marketWorkflow;
  const lockedSide = market.viewerWager?.side ?? null;
  const displaySide = activeSelection?.side ?? lockedSide;
  const displaySelectedPool = displaySide
    ? displaySide === "left"
      ? market.left.poolWolo
      : market.right.poolWolo
    : 0;
  const displayOppositePool = displaySide
    ? displaySide === "left"
      ? market.right.poolWolo
      : market.left.poolWolo
    : 0;
  const projectedReturn = activeSelection
    ? projectReturn(activeSelection.stake, displaySelectedPool, displayOppositePool)
    : market.viewerWager && displaySide
      ? projectReturn(
          market.viewerWager.amountWolo,
          Math.max(0, displaySelectedPool - market.viewerWager.amountWolo),
          displayOppositePool
        )
      : 0;
  const stakeError = activeSelection ? validateStakeAmount(activeSelection.stake, maxStakeWolo) : null;
  const lockLabel = marketWorkflow
    ? marketWorkflow.phase === "awaiting_wallet"
      ? "Wallet..."
      : marketWorkflow.phase === "confirming_chain"
        ? "Chain..."
        : "Saving..."
    : activeSelection
      ? `Add ${activeSelection.stake}`
      : market.viewerWager
        ? "Add"
        : "Lock";

  return (
    <article className={`${cardClass()} overflow-hidden p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-2">
          <div className="text-[11px] uppercase tracking-[0.32em] text-slate-500 break-words">
            {market.eventLabel}
          </div>
          {market.href ? (
            <Link
              href={market.href}
              className="mt-2 inline-flex text-[1.65rem] font-semibold leading-[1.05] text-white transition hover:text-amber-100"
            >
              {market.title}
            </Link>
          ) : (
            <div className="mt-2 text-[1.65rem] font-semibold leading-[1.05] text-white break-words">
              {market.title}
            </div>
          )}
          <FounderBonusChips
            bonuses={market.founderBonuses}
            compact
            variant={detailMode === "basic" ? "micro" : "full"}
          />
          <MarketTimingRail market={market} nowMs={nowMs} />
        </div>
        <div className="flex flex-col items-end gap-2">
          <MarketStatusPill market={market} />
          {market.href ? (
            <Link
              href={market.href}
              className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] transition ${edgeButton("glass")}`}
            >
              View Match
            </Link>
          ) : null}
        </div>
      </div>

      <div className={`${insetClass()} mt-4 px-4 py-3`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Pot</div>
            <div className="mt-2 flex items-center gap-2 text-base font-semibold text-white">
              <CoinMark small />
              <span>{formatExactWolo(market.totalPotWolo)} WOLO</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>{market.left.crowdPercent}% left</div>
            <div>{market.right.crowdPercent}% right</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <SideMiniChoice
          side={market.left}
          selected={displaySide === "left"}
          emphasis={accent === "warm" ? "warm" : "cool"}
          disabled={!canEditSlip || Boolean(lockedSide && lockedSide !== "left")}
          onSelect={() => onSelect(market, "left")}
        />
        <SideMiniChoice
          side={market.right}
          selected={displaySide === "right"}
          emphasis={accent === "warm" ? "cool" : "warm"}
          disabled={!canEditSlip || Boolean(lockedSide && lockedSide !== "right")}
          onSelect={() => onSelect(market, "right")}
        />
      </div>

      <div className={`${insetClass()} mt-4 px-4 py-4`}>
        <StakeAmountRail
          activeSelection={activeSelection}
          canEdit={canEditSlip}
          maxStakeWolo={maxStakeWolo}
          onStakeChange={onStakeChange}
        />

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">If Right</div>
            <div className="mt-2 text-base font-semibold text-white">
              {activeSelection ? `${formatCompact(projectedReturn)} WOLO` : "Pick"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            {isAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenFounderBonus(market, "participants")}
                  className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100 transition hover:bg-amber-400/18"
                >
                  +FB
                </button>
                <button
                  type="button"
                  onClick={() => onOpenFounderBonus(market, "winner")}
                  className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-2 text-[11px] text-sky-100 transition hover:bg-sky-400/18"
                >
                  +FW
                </button>
              </>
            ) : null}
            {market.viewerWager && !onchainLocked ? (
              <button
                type="button"
                onClick={onClear}
                disabled={workingKey === `clear-${market.id}`}
                className={`rounded-full px-3 py-2 text-xs transition ${edgeButton("glass")} ${
                  workingKey === `clear-${market.id}` ? "opacity-60" : ""
                }`}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={onLock}
              disabled={!activeSelection || Boolean(stakeError) || !canEditSlip || workingKey === `lock-${market.id}`}
              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${edgeButton(
                accent === "warm" ? "gold" : "blue"
              )} ${!activeSelection || Boolean(stakeError) || !canEditSlip || workingKey === `lock-${market.id}` ? "opacity-60" : ""}`}
            >
              {lockLabel}
            </button>
          </div>
        </div>
      </div>

      {detailMode === "advanced" ? (
        <WarTape rows={market.warTape} emptyLabel="No tape rows yet." />
      ) : null}
    </article>
  );
}

function SideChoice({
  side,
  selected,
  emphasis,
  disabled = false,
  onSelect,
}: {
  side: BetBoardSide;
  selected: boolean;
  emphasis: "warm" | "cool";
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-[1.45rem] border px-4 py-4 text-left transition ${sideSurface(
        selected,
        emphasis
      )} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Pick</div>
          <div className="mt-2 text-2xl font-semibold leading-tight text-white">{side.name}</div>
        </div>
        <div className="rounded-full border border-white/[0.08] bg-black/10 px-3 py-1 text-xs text-slate-200">
          {side.crowdPercent}%
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-slate-200">
        <div className="flex items-center gap-2">
          <CoinMark small />
          <span>{formatCompact(side.poolWolo)}</span>
        </div>
        <span>{side.slips} slips</span>
      </div>
    </button>
  );
}

function SideMiniChoice({
  side,
  selected,
  emphasis,
  disabled = false,
  onSelect,
}: {
  side: BetBoardSide;
  selected: boolean;
  emphasis: "warm" | "cool";
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`rounded-[1.15rem] border px-3 py-3 text-left transition ${sideSurface(
        selected,
        emphasis
      )} ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="min-h-[2.5rem] text-sm font-semibold leading-snug text-white break-words">
        {side.name}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-300">
        <span>{side.crowdPercent}%</span>
        <span>{formatCompact(side.poolWolo)}</span>
      </div>
    </button>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardClass()} px-3 py-3 sm:px-4 sm:py-4`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:text-[11px] sm:tracking-[0.28em]">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold leading-tight tracking-tight text-white break-words sm:text-2xl">
        {value}
      </div>
    </div>
  );
}

function HeatRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={`${cardClass()} px-4 py-4`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{detail}</div>
    </div>
  );
}

function LoadingMarket() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 w-32 rounded-full bg-white/10" />
      <div className="h-12 w-72 rounded-2xl bg-white/10" />
      <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
        <div className="h-32 rounded-[1.4rem] bg-white/10" />
      </div>
      <div className="h-24 rounded-[1.4rem] bg-white/10" />
    </div>
  );
}

function LoadingCard() {
  return <div className={`${cardClass()} h-[18rem] animate-pulse bg-white/[0.03]`} />;
}

function EmptyShell({ label }: { label: string }) {
  return (
    <div className={`${insetClass()} px-4 py-5 text-sm text-slate-300`}>{label}</div>
  );
}
