"use client";

import Image from "next/image";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";
const STAKE_OPTIONS = [10, 25, 50, 100] as const;

export type BetSide = "left" | "right";
export type BetStatus = "open" | "closing" | "live" | "settled";
export type BetsViewMode = "basic" | "advanced";
export type FounderBonusType = "participants" | "winner";

export type BetFounderChip = {
  id: number;
  bonusType: FounderBonusType;
  totalAmountWolo: number;
  note: string | null;
  status: string;
  createdAt: string;
};

export type BetWarTapeRow = {
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

export type BetBoardSide = {
  key: BetSide;
  name: string;
  href: string | null;
  poolWolo: number;
  crowdPercent: number;
  slips: number;
  seededWolo: number;
};

export type BetBoardMarket = {
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
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  founderBonuses: BetFounderChip[];
  warTape: BetWarTapeRow[];
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

export type BetBookEntry = {
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
  status: BetStatus;
  executionMode: "app_only" | "onchain_escrow";
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
};

export type BetSettledResult = {
  id: number;
  title: string;
  eventLabel: string;
  winner: string;
  mapName: string;
  totalPotWolo: number;
  payoutWolo: number;
  settledAt: string | null;
  href: string | null;
  founderBonuses: BetFounderChip[];
};

export type BetBoardSnapshot = {
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

export type SelectionState = {
  marketId: number;
  side: BetSide;
  stake: number;
};

export type LockWorkflow = {
  marketId: number;
  phase: "awaiting_wallet" | "confirming_chain" | "recording_wager";
  stakeTxHash: string | null;
};

export type PendingStakeRecovery = {
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

export function shortTxHash(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

export function formatExactWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatSettledTime(value: string | null) {
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

export function validateStakeAmount(stake: number, maxStake: number) {
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

export function edgeButton(kind: "gold" | "blue" | "glass") {
  if (kind === "gold") {
    return "border border-amber-200/14 bg-[linear-gradient(135deg,#fde68a_0%,#f5c95f_28%,#d7a73e_72%,#8c5e10_100%)] text-slate-950 shadow-[0_14px_34px_rgba(245,158,11,0.18)] hover:brightness-105";
  }
  if (kind === "blue") {
    return "border border-sky-200/12 bg-[linear-gradient(135deg,#dbeafe_0%,#93c5fd_26%,#3b82f6_68%,#1d4ed8_100%)] text-slate-950 shadow-[0_14px_34px_rgba(59,130,246,0.16)] hover:brightness-105";
  }
  return "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 hover:border-white/14 hover:bg-white/[0.08]";
}

export function insetClass() {
  return "rounded-[1.55rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.024))] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";
}

export function shellClass() {
  return "rounded-[1.9rem] border border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.08),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.08),transparent_30%),linear-gradient(180deg,rgba(13,20,36,0.98),rgba(8,13,24,0.98))] shadow-[0_28px_80px_rgba(2,6,23,0.36)]";
}

export function cardClass() {
  return "rounded-[1.45rem] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.038),rgba(255,255,255,0.02))] shadow-[0_18px_42px_rgba(2,6,23,0.22)]";
}

export function CoinMark({ small = false }: { small?: boolean }) {
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

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${cardClass()} px-4 py-4`}>
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</div>
    </div>
  );
}

export function stakeOptionValues() {
  return STAKE_OPTIONS;
}