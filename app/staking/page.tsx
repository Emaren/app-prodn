import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  Clock3,
  Coins,
  Crown,
  Gem,
  HandCoins,
  Landmark,
  Swords,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

import { getPrisma } from "@/lib/prisma";
import {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
  loadStakingLeaderboard,
  loadStakingSummary,
  STAKER_SHARE_BPS,
  type StakingActivityItem,
  type StakingLeaderboardRow,
} from "@/lib/staking";
import {
  formatPublicStakingWeight,
  formatPublicStakingWeightStat,
} from "@/lib/stakingDisplay";
import { getStakingWalletReserveHeadroomWolo } from "@/lib/stakingExecution";
import { fetchWoloBalanceAmount } from "@/lib/woloRuntime";
import {
  formatWoloAmount,
  shortenAddress,
  WOLO_COIN_DECIMALS,
  WOLO_REST_URL,
} from "@/lib/woloChain";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";
import StakingWalletPanel from "./StakingWalletPanel";
import StakingActivityFeed from "./StakingActivityFeed";
import StakingHeroStakeTiles from "./StakingHeroStakeTiles";
import StakingActionTile from "./StakingActionTile";
import StakingAdvancedTrigger from "./StakingAdvancedTrigger";
import TreasuryActions from "./TreasuryActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staking",
  description:
    "Stake WOLO and track the betting-fee economy inside AoE2HDBets.",
  alternates: {
    canonical: "/staking",
  },
};

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";

type PeriodKey = "24h" | "7d" | "30d" | "all";
type BoardKey = "stakers" | "earners" | "rewards";

type StakingSearchParams = Promise<{
  period?: string | string[];
  board?: string | string[];
}>;

type ActivityItem = StakingActivityItem;

type EconomySnapshot = {
  period: PeriodKey;
  generatedAt: string;
  dataLive: boolean;
  betsPlaced: number | null;
  betVolumeWolo: number | null;
  payoutWolo: number | null;
  settledVolumeWolo: number | null;
  stakerFeePoolWolo: number | null;
  treasuryShareWolo: number | null;
  activeBettors: number | null;
  activePlayers: number | null;
  activeStakers: number | null;
  totalStakedWolo: number | null;
  totalStakingWeight: string | null;
  activity: ActivityItem[];
};

type BoardRow = {
  player: string;
  badge: string;
  staked: string;
  rewards: string;
  weight: string;
  status: string;
  tone: "gold" | "emerald" | "sky" | "slate";
};

type TrustWalletSnapshot = {
  address: string | null;
  shortAddress: string;
  balanceLabel: string;
  balanceWolo: number | null;
  proofUrl: string | null;
  status: "ready" | "pending" | "error";
  detail: string;
};

type CommunityTreasurySnapshot = TrustWalletSnapshot;

const PERIODS: Array<{ key: PeriodKey; label: string; days: number | null }> = [
  { key: "24h", label: "24H", days: 1 },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "all", label: "All-Time", days: null },
];

const BOARDS: Array<{ key: BoardKey; label: string }> = [
  { key: "stakers", label: "Top Stakers" },
  { key: "earners", label: "Top Earners" },
  { key: "rewards", label: "Recent Rewards" },
];

const TREASURY_ADDRESS_ENV_NAMES = [
  "WOLO_COMMUNITY_TREASURY_ADDRESS",
  "WOLO_COMMUNITY_TREASURY",
  "WOLO_TREASURY_ADDRESS",
  "WOLO_TREASURY",
  "WOLO_MATCH_GUARANTEE_TREASURY_ADDRESS",
  "WOLO_MATCH_GUARANTEE_TREASURY",
  "WOLO_TREASURY_WALLET_ADDRESS",
  "WOLO_TREASURY_WALLET",
  "WOLO_COMMUNITY_TREASURY_WALLET_ADDRESS",
  "WOLO_COMMUNITY_TREASURY_WALLET",
  "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY",
  "NEXT_PUBLIC_WOLO_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_TREASURY",
  "NEXT_PUBLIC_WOLO_MATCH_GUARANTEE_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_MATCH_GUARANTEE_TREASURY",
  "NEXT_PUBLIC_WOLO_TREASURY_WALLET_ADDRESS",
  "NEXT_PUBLIC_WOLO_TREASURY_WALLET",
] as const;

const BOARD_ROWS: Record<
  BoardKey,
  BoardRow[]
> = {
  stakers: [
    { player: "Founder Seat", badge: "Crown lane", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Top seat", tone: "gold" },
    { player: "Early Backer", badge: "First wave", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Ready soon", tone: "emerald" },
    { player: "Verified Grinder", badge: "Match regular", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Open slot", tone: "sky" },
    { player: "War Chest Leader", badge: "Top earner", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Unclaimed", tone: "slate" },
  ],
  earners: [
    { player: "Top Earner", badge: "Crown lane", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Preview", tone: "gold" },
    { player: "Fee Hunter", badge: "Daily share", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Preview", tone: "emerald" },
    { player: "Match Regular", badge: "Steady heat", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Preview", tone: "sky" },
    { player: "New Backer", badge: "Open seat", staked: "Ledger pending", rewards: "Modeled", weight: "Opening soon", status: "Preview", tone: "slate" },
  ],
  rewards: [
    { player: "Daily Pool", badge: "Preparing", staked: "1% of pot", rewards: "50% share", weight: "Pool weight", status: "Stakers", tone: "gold" },
    { player: "Treasury", badge: "Community", staked: "1% of pot", rewards: "50% share", weight: "Visible", status: "Visible", tone: "emerald" },
    { player: "Next Match", badge: "Settles soon", staked: "Open", rewards: "Feeds pool", weight: "Live loop", status: "Live loop", tone: "sky" },
    { player: "Reward Cutover", badge: "Ledger", staked: "Pending", rewards: "Preparing", weight: "Pending", status: "Next", tone: "slate" },
  ],
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizePeriod(value: string | string[] | undefined): PeriodKey {
  const raw = firstParam(value);
  return raw === "7d" || raw === "30d" || raw === "all" ? raw : "24h";
}

function normalizeBoard(value: string | string[] | undefined): BoardKey {
  const raw = firstParam(value);
  return raw === "earners" || raw === "rewards" ? raw : "stakers";
}

function hrefFor(params: { period: PeriodKey; board: BoardKey }) {
  const search = new URLSearchParams();
  if (params.period !== "24h") search.set("period", params.period);
  if (params.board !== "stakers") search.set("board", params.board);
  const query = search.toString();
  return query ? `/staking?${query}` : "/staking";
}

function formatNumber(value: number | null) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatWolo(
  value: number | null,
  options: { compact?: boolean; decimals?: number } = {}
) {
  if (value == null) return "--";
  const compact = options.compact ?? value >= 10000;
  const decimals =
    options.decimals ??
    (compact ? 1 : Number.isInteger(value) ? 0 : value < 1000 ? 2 : 1);
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: compact ? 0 : Number.isInteger(value) ? 0 : Math.min(decimals, 2),
    notation: compact ? "compact" : "standard",
  }).format(value);

  return `${formatted} WOLO`;
}

function formatFeeShareWolo(value: number | null) {
  return formatWolo(value, { compact: false, decimals: 2 });
}

function formatBpsPercent(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value / 100)}%`;
}

function weightMeter(value: string | null | undefined) {
  if (!value || value === "0") {
    return {
      width: 9,
      barClass: "bg-amber-300",
      chipClass: "border-amber-200/20 bg-amber-300/10 text-amber-100",
      label: "Opening",
    };
  }

  const raw = BigInt(value);
  const safeNumber = raw > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(raw);
  const score = Math.min(1, Math.log10(safeNumber + 1) / 10);
  const width = Math.max(12, Math.round(10 + score * 86));

  if (score > 0.82) {
    return {
      width,
      barClass: "bg-[linear-gradient(90deg,#fbbf24,#34d399,#f87171)]",
      chipClass: "border-red-300/20 bg-red-500/10 text-red-100",
      label: "Heavy",
    };
  }

  if (score > 0.42) {
    return {
      width,
      barClass: "bg-[linear-gradient(90deg,#fbbf24,#34d399)]",
      chipClass: "border-emerald-300/20 bg-emerald-500/10 text-emerald-100",
      label: "Growing",
    };
  }

  return {
    width,
    barClass: "bg-amber-300",
    chipClass: "border-amber-200/20 bg-amber-300/10 text-amber-100",
    label: "Building",
  };
}

function stakerEarnedLabel(period: PeriodKey) {
  if (period === "24h") return "Today Stakers Earned";
  if (period === "7d") return "7D Stakers Earned";
  if (period === "30d") return "30D Stakers Earned";
  return "All-Time Stakers Earned";
}

function resolveTreasuryAddress() {
  for (const name of TREASURY_ADDRESS_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function buildWalletProofUrl(address: string) {
  const template = process.env.NEXT_PUBLIC_WOLO_EXPLORER_ADDRESS_URL?.trim();
  if (template) return template.replace("{address}", encodeURIComponent(address));

  const base = process.env.NEXT_PUBLIC_WOLO_EXPLORER_URL?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/address/${encodeURIComponent(address)}`;

  return `${WOLO_REST_URL.replace(/\/+$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`;
}

async function loadCommunityTreasurySnapshot(): Promise<CommunityTreasurySnapshot> {
  const address = resolveTreasuryAddress();
  if (!address) {
    return {
      address: null,
      shortAddress: "Wallet pending",
      balanceLabel: "--",
      balanceWolo: null,
      proofUrl: null,
      status: "pending",
      detail: "Public treasury wallet config pending.",
    };
  }

  try {
    const amountUWolo = await fetchWoloBalanceAmount(address);
    return {
      address,
      shortAddress: shortenAddress(address, 10, 6),
      balanceLabel: `${formatWoloAmount(amountUWolo)} WOLO`,
      balanceWolo: Number(amountUWolo) / 10 ** WOLO_COIN_DECIMALS,
      proofUrl: buildWalletProofUrl(address),
      status: "ready",
      detail: "Public wallet",
    };
  } catch (error) {
    return {
      address,
      shortAddress: shortenAddress(address, 10, 6),
      balanceLabel: "--",
      balanceWolo: null,
      proofUrl: buildWalletProofUrl(address),
      status: "error",
      detail: error instanceof Error ? "Balance lookup pending." : "Balance pending.",
    };
  }
}

async function loadStakingWalletSnapshot(): Promise<TrustWalletSnapshot> {
  const runtime = getWoloStakingRuntime();
  const address = runtime.stakingWalletAddress || null;
  if (!address) {
    return {
      address: null,
      shortAddress: "Wallet pending",
      balanceLabel: "--",
      balanceWolo: null,
      proofUrl: null,
      status: "pending",
      detail: "Staking wallet pending.",
    };
  }

  try {
    const amountUWolo = await fetchWoloBalanceAmount(address);
    return {
      address,
      shortAddress: shortenAddress(address, 10, 6),
      balanceLabel: `${formatWoloAmount(amountUWolo)} WOLO`,
      balanceWolo: Number(amountUWolo) / 10 ** WOLO_COIN_DECIMALS,
      proofUrl: buildWalletProofUrl(address),
      status: "ready",
      detail: runtime.walletSource === "staking" ? "Staking wallet" : "Custody rail",
    };
  } catch {
    return {
      address,
      shortAddress: shortenAddress(address, 10, 6),
      balanceLabel: "--",
      balanceWolo: null,
      proofUrl: buildWalletProofUrl(address),
      status: "error",
      detail: "Balance lookup pending.",
    };
  }
}

async function loadEconomySnapshot(period: PeriodKey): Promise<EconomySnapshot> {
  return loadStakingSummary(getPrisma(), period);
}

function fallbackSnapshot(period: PeriodKey): EconomySnapshot {
  return {
    period,
    generatedAt: new Date().toISOString(),
    dataLive: false,
    betsPlaced: null,
    betVolumeWolo: null,
    payoutWolo: null,
    settledVolumeWolo: null,
    stakerFeePoolWolo: null,
    treasuryShareWolo: null,
    activeBettors: null,
    activePlayers: null,
    activeStakers: null,
    totalStakedWolo: null,
    totalStakingWeight: null,
    activity: [
      {
        label: "Economy feed is offline",
        detail: "The page is ready. Betting data will return when the app database is reachable.",
        meta: "Fallback",
        tone: "slate",
      },
    ],
  };
}

function mapLeaderboardRow(row: StakingLeaderboardRow): BoardRow {
  return {
    player: row.player,
    badge: row.badge,
    staked: row.stakedWolo > 0 ? formatWolo(row.stakedWolo) : "--",
    rewards: row.rewardsWolo > 0 ? formatWolo(row.rewardsWolo) : "--",
    weight: formatPublicStakingWeight(row.stakingWeight),
    status: row.status,
    tone: row.tone,
  };
}

export default async function StakingPage({
  searchParams,
}: {
  searchParams?: StakingSearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const period = normalizePeriod(resolvedSearchParams?.period);
  const board = normalizeBoard(resolvedSearchParams?.board);

  let snapshot: EconomySnapshot;
  try {
    snapshot = await loadEconomySnapshot(period);
  } catch (error) {
    console.warn("Failed to load staking economy snapshot:", error);
    snapshot = fallbackSnapshot(period);
  }

  let boardRows = BOARD_ROWS[board];
  try {
    const leaderboard = await loadStakingLeaderboard(getPrisma(), board);
    if (leaderboard.rows.length > 0) {
      boardRows = leaderboard.rows.map(mapLeaderboardRow);
    }
  } catch (error) {
    console.warn("Failed to load staking leaderboard:", error);
  }

  const [stakingWallet, treasury] = await Promise.all([
    loadStakingWalletSnapshot(),
    loadCommunityTreasurySnapshot(),
  ]);
  const stakingWalletReserveHeadroomWolo = getStakingWalletReserveHeadroomWolo();
  const visibleStakingWalletReserveWolo =
    stakingWallet.balanceWolo == null || snapshot.totalStakedWolo == null
      ? null
      : Math.max(0, stakingWallet.balanceWolo - snapshot.totalStakedWolo);
  const activityRows = snapshot.activity.slice(0, 16);
  const bettingFeeLabel = formatBpsPercent(BETTING_FEE_RATE_BPS);
  const stakerShareLabel = formatBpsPercent(
    Math.floor((BETTING_FEE_RATE_BPS * STAKER_SHARE_BPS) / BPS_DENOMINATOR)
  );
  const treasuryShareLabel = formatBpsPercent(
    BETTING_FEE_RATE_BPS -
      Math.floor((BETTING_FEE_RATE_BPS * STAKER_SHARE_BPS) / BPS_DENOMINATOR)
  );
  const mainnetActivityNote =
    "Mainnet transfer feed is limited until chain tx indexing is enabled. This feed shows app-recorded wolo-1 tx hashes, staking, wager, settlement, faucet, and treasury movements.";
  const meter = weightMeter(snapshot.totalStakingWeight);

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-7 sm:py-4">
      <style>{`
        @keyframes stakingActivityGlow {
          0% {
            border-color: rgba(251, 191, 36, 0.55);
            box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.16), 0 0 34px rgba(251, 191, 36, 0.22);
            transform: translateY(-2px);
          }
          62% {
            border-color: rgba(251, 191, 36, 0.26);
            box-shadow: 0 0 28px rgba(251, 191, 36, 0.11);
            transform: translateY(0);
          }
          100% {
            border-color: rgba(255, 255, 255, 0.1);
            box-shadow: none;
            transform: translateY(0);
          }
        }
        .staking-activity-new {
          animation: stakingActivityGlow 1.8s ease-out 1;
        }
      `}</style>
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_14%_18%,rgba(148,163,184,0.12),transparent_26%),radial-gradient(circle_at_86%_12%,rgba(251,191,36,0.12),transparent_24%),radial-gradient(circle_at_70%_86%,rgba(59,130,246,0.08),transparent_24%),linear-gradient(135deg,#07101d,#111827_52%,#040712)] p-5 shadow-[0_42px_120px_rgba(2,6,23,0.45)] sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.34),transparent)]" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-amber-300/10" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-full bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.2))]" />

        <div className="relative z-10 grid min-w-0 gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] xl:items-stretch">
          <div className="flex h-full min-w-0 flex-col gap-6">
            <div className="flex flex-wrap gap-2">
              <HeroPill tone="amber">{bettingFeeLabel} betting fee</HeroPill>
              <HeroPill tone="emerald">50% to stakers</HeroPill>
              <HeroPill tone="slate">No lockups</HeroPill>
            </div>

            <div className="space-y-4">
              <StakingAdvancedTrigger>
                <WoloMark />
                <div className="text-xs uppercase tracking-[0.34em] text-amber-200/75">
                  WOLO Economy
                </div>
              </StakingAdvancedTrigger>
              <div className="space-y-4 sm:pl-[4.25rem]">
                <h1 className="max-w-4xl text-[2.05rem] font-semibold leading-tight text-white sm:text-[2.7rem] lg:text-[3.35rem]">
                  Stake WOLO.
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  50% of betting fees go to stakers.
                </p>
              </div>
            </div>

            <StakingHeroStakeTiles
              totalStakedLabel={formatWolo(snapshot.totalStakedWolo, { compact: false })}
            />

            <CompactLeaderboard
              board={board}
              boardRows={boardRows}
              period={period}
              className="flex-1"
            />
            <StakingActionTile />
          </div>

          <div className="flex h-full min-w-0 flex-col gap-4">
            <section className="rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.94),rgba(3,6,12,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-white/45">
                    War Chest Pulse
                  </div>
                </div>
                <DataBadge live={snapshot.dataLive} />
              </div>

              <div className="mt-5 rounded-[1.45rem] border border-amber-300/25 bg-white/[0.045] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.16)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.26em] text-amber-100/70">
                      {stakerEarnedLabel(period)}
                    </div>
                    <div className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                      {formatFeeShareWolo(snapshot.stakerFeePoolWolo)}
                    </div>
                  </div>
                  <div className="rounded-full border border-amber-200/25 bg-amber-300/12 p-3 text-amber-100">
                    <Crown className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-4 text-sm leading-6 text-slate-300">
                  50% of settled betting fees.
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <HeroStat label="Bet Volume" value={formatWolo(snapshot.betVolumeWolo)} helper={`${formatNumber(snapshot.betsPlaced)} bets`} />
                <HeroStat label="Payouts" value={formatWolo(snapshot.payoutWolo)} helper="Settled returns" />
                <HeroStat label="Bets Placed" value={formatNumber(snapshot.betsPlaced)} helper="Wagers in window" />
                <HeroStat label="Treasury Share" value={formatFeeShareWolo(snapshot.treasuryShareWolo)} helper="50% fee share" />
              </div>

              <div className="mt-5 rounded-[1.35rem] border border-amber-300/12 bg-white/[0.045] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-amber-100">Staking Weight</div>
                  <div className={`rounded-full border px-3 py-1 text-xs ${meter.chipClass}`}>
                    {meter.label}
                  </div>
                </div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {formatPublicStakingWeightStat(snapshot.totalStakingWeight)}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${meter.barClass}`}
                    style={{ width: `${meter.width}%` }}
                  />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  More WOLO plus more time.
                </p>
              </div>
            </section>

            <StakingWalletTrustTile
              wallet={stakingWallet}
              visibleReserveWolo={visibleStakingWalletReserveWolo}
              requiredReserveWolo={stakingWalletReserveHeadroomWolo}
            />
            <CommunityTreasuryTile treasury={treasury} />
          </div>
        </div>
      </section>

      <Panel id="staking-advanced" eyebrow="Recent Activity" title="Live activity">
        <StakingActivityFeed items={activityRows} note={mainnetActivityNote} />
      </Panel>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Economy Rail</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Money moving through the room</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {PERIODS.map((item) => (
              <Link
                key={item.key}
                href={hrefFor({ period: item.key, board })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  period === item.key
                    ? "border-amber-300/45 bg-amber-300/18 text-amber-100"
                    : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/20 hover:bg-white/[0.075]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <EconomyCard
            icon={<HandCoins className="h-5 w-5" />}
            label="Stakers Earned"
            value={formatFeeShareWolo(snapshot.stakerFeePoolWolo)}
            helper="50% fee share"
            tone="amber"
            featured
          />
          <EconomyCard
            icon={<BadgeDollarSign className="h-5 w-5" />}
            label="Bet Volume"
            value={formatWolo(snapshot.betVolumeWolo)}
            helper="Real wagers in this window"
            tone="sky"
          />
          <EconomyCard
            icon={<Swords className="h-5 w-5" />}
            label="Bets Placed"
            value={formatNumber(snapshot.betsPlaced)}
            helper="Wagers in this window"
            tone="slate"
          />
          <EconomyCard
            icon={<Trophy className="h-5 w-5" />}
            label="Payouts"
            value={formatWolo(snapshot.payoutWolo)}
            helper="Settled payout value"
            tone="emerald"
          />
          <EconomyCard
            icon={<Crown className="h-5 w-5" />}
            label="Treasury Share"
            value={formatFeeShareWolo(snapshot.treasuryShareWolo)}
            helper="50% fee share"
            tone="amber"
          />
          <EconomyCard
            icon={<Users className="h-5 w-5" />}
            label="Active Bettors"
            value={formatNumber(snapshot.activeBettors)}
            helper="Placed wagers"
            tone="sky"
          />
          <EconomyCard
            icon={<Users className="h-5 w-5" />}
            label="Active Players"
            value={formatNumber(snapshot.activePlayers)}
            helper={period === "all" ? "Registered players" : "Seen in window"}
            tone="slate"
          />
          <EconomyCard
            icon={<BarChart3 className="h-5 w-5" />}
            label="Active Stakers"
            value={formatNumber(snapshot.activeStakers)}
            helper={snapshot.totalStakedWolo ? `${formatWolo(snapshot.totalStakedWolo)} staked` : "Ledger ready"}
            tone="emerald"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel eyebrow="Betting Fee" title="Every Bet Feeds the System">
          <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[1.35rem] border border-amber-300/12 bg-white/[0.045] p-5">
              <div className="text-xs uppercase tracking-[0.26em] text-amber-100/70">
                Betting Fee
              </div>
              <div className="mt-4 text-5xl font-semibold text-white">{bettingFeeLabel}</div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/30">
                <div className="grid h-full grid-cols-2">
                  <div className="bg-amber-200/80" />
                  <div className="bg-emerald-300" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-full bg-amber-300/12 px-3 py-1.5 text-amber-100">
                  50% Stakers
                </div>
                <div className="rounded-full bg-emerald-300/12 px-3 py-1.5 text-emerald-100">
                  50% Treasury
                </div>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Example Match</div>
                  <h3 className="mt-2 text-xl font-semibold text-white">10,000 vs 10,000 WOLO</h3>
                </div>
                <Swords className="h-5 w-5 text-amber-100" />
              </div>
              <div className="mt-5 grid gap-2">
                <SplitRow label="Pot" value="20,000 WOLO" />
                <SplitRow label="Betting fee" value="400 WOLO" />
                <SplitRow label="Stakers receive" value="200 WOLO" tone="amber" />
                <SplitRow label="Treasury receives" value="200 WOLO" tone="emerald" />
                <SplitRow label="Winner receives" value="19,600 WOLO" tone="white" />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Every settled bet feeds both pools: {stakerShareLabel} to stakers and {treasuryShareLabel} to treasury.
              </p>
            </div>
          </div>
        </Panel>

        <StakingWalletPanel />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <RewardCard
          icon={<Coins className="h-5 w-5" />}
          title="Stake"
          copy="Choose how much WOLO to put to work. Your stake starts counting immediately."
        />
        <RewardCard
          icon={<Gem className="h-5 w-5" />}
          title="Earn"
          copy="50% of betting fees are shared with stakers every day."
        />
        <RewardCard
          icon={<Clock3 className="h-5 w-5" />}
          title="Leave Anytime"
          copy="Unstake whenever you need your WOLO. Rewards stay fair through Staking Weight."
        />
      </section>

      <section className="rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,29,0.92),rgba(4,7,14,0.98))] p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Reward Math</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Your share = your Staking Weight / total Staking Weight.</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              More WOLO plus more time equals more rewards.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormulaTile label="Staking Weight" value="More WOLO + time" helper="WOLO x time" />
            <FormulaTile label="Daily Pool" value={`${stakerShareLabel} of pot`} helper="50% of fee" />
            <FormulaTile label="Your Share" value="Fair split" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <TrustCard title="No Inflation" copy="Betting fees only." />
        <TrustCard title="No Lockups" copy="Stake and unstake freely." />
        <TrustCard title="Fair Weight" copy="WOLO x time." />
        <TrustCard title="Visible Pools" copy="Staker and treasury revenue." />
        <TrustCard title="No Fake APY" copy="No emissions." />
      </section>

      <section className="overflow-hidden rounded-[1.65rem] border border-amber-300/18 bg-[radial-gradient(circle_at_16%_18%,rgba(251,191,36,0.18),transparent_30%),linear-gradient(135deg,rgba(18,24,38,0.98),rgba(6,10,18,0.98))] p-6 sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-amber-100/70">
              Ready
            </div>
            <h2 className="mt-2 text-3xl font-semibold text-white">Stake WOLO. Share the Betting Fees.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Stake from your profile, watch the fee pool grow, and earn your share as matches settle.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/profile" className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">
              Stake WOLO
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/bets" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/90 transition hover:border-white/25 hover:bg-white/10 hover:text-white">
              Go to Bets
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function WoloMark() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/28 bg-[radial-gradient(circle_at_35%_25%,rgba(251,191,36,0.18),rgba(15,23,42,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_34px_rgba(2,6,23,0.28)]">
      <Image src={WOLO_LOGO_SRC} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
    </div>
  );
}

function DataBadge({ live }: { live: boolean }) {
  return (
    <div className={`rounded-full border px-3 py-1 text-xs ${live ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100" : "border-slate-300/15 bg-white/5 text-slate-300"}`}>
      {live ? "Live data" : "Fallback"}
    </div>
  );
}

function HeroPill({ children, tone = "slate" }: { children: ReactNode; tone?: "amber" | "emerald" | "slate" }) {
  const toneClass =
    tone === "amber"
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
        : "border-white/10 bg-white/[0.055] text-slate-200";

  return (
    <div className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${toneClass}`}>
      {children}
    </div>
  );
}

function HeroStat({
  label,
  value,
  helper,
  featured = false,
}: {
  label: string;
  value: string;
  helper?: string;
  featured?: boolean;
}) {
  return (
    <div className={`rounded-[1.15rem] border p-4 ${featured ? "border-amber-300/25 bg-amber-300/10" : "border-white/10 bg-white/[0.045]"}`}>
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-400">{helper}</div> : null}
    </div>
  );
}

function EconomyCard({
  icon,
  label,
  value,
  helper,
  tone,
  featured = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
  tone: "amber" | "emerald" | "sky" | "slate";
  featured?: boolean;
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-100 bg-amber-300/10 border-amber-300/20"
      : tone === "emerald"
        ? "text-emerald-100 bg-emerald-500/10 border-emerald-300/20"
        : tone === "sky"
          ? "text-sky-100 bg-sky-500/10 border-sky-300/18"
          : "text-slate-200 bg-white/[0.045] border-white/10";

  return (
    <div className={`min-h-[9.4rem] rounded-[1.35rem] border p-4 shadow-[0_18px_65px_rgba(2,6,23,0.22)] ${featured ? "border-amber-300/25 bg-white/[0.045]" : "border-white/10 bg-white/[0.04]"}`}>
      <div className={`inline-flex rounded-full border p-2 ${toneClass}`}>{icon}</div>
      <div className="mt-4 text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{helper}</div>
    </div>
  );
}

function Panel({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,29,0.92),rgba(4,7,14,0.98))] p-5 shadow-[0_24px_90px_rgba(2,6,23,0.25)] sm:p-6"
    >
      <div className="mb-5">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{eyebrow}</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function CompactLeaderboard({
  board,
  boardRows,
  period,
  className = "",
}: {
  board: BoardKey;
  boardRows: BoardRow[];
  period: PeriodKey;
  className?: string;
}) {
  return (
    <section className={`flex min-h-[18rem] flex-col overflow-hidden rounded-[1.45rem] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Loyalty Board</div>
          <h2 className="mt-1 text-xl font-semibold text-white">Staker status room</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {BOARDS.map((item) => (
            <Link
              key={item.key}
              href={hrefFor({ period, board: item.key })}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                board === item.key
                  ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                  : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/20 hover:bg-white/[0.075]"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-hidden">
        <div className="hidden rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-slate-500 md:grid md:grid-cols-[2.5rem_1.3fr_0.9fr_1fr_0.75fr] md:gap-2">
          <div>Rank</div>
          <div>Player</div>
          <div>Staked</div>
          <div>Weight</div>
          <div>Status</div>
        </div>
        {boardRows.slice(0, 4).map((row, index) => (
          <CompactLeaderboardRow key={`${board}-${row.player}`} rank={index + 1} row={row} />
        ))}
      </div>
    </section>
  );
}

function CompactLeaderboardRow({
  rank,
  row,
}: {
  rank: number;
  row: BoardRow;
}) {
  const badgeClass =
    row.tone === "gold"
      ? "border-amber-300/25 bg-amber-300/12 text-amber-100"
      : row.tone === "emerald"
        ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"
        : row.tone === "sky"
          ? "border-sky-300/20 bg-sky-500/10 text-sky-100"
          : "border-white/10 bg-white/[0.055] text-slate-200";

  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] p-3 md:grid md:grid-cols-[2.5rem_1.3fr_0.9fr_1fr_0.75fr] md:items-center md:gap-2">
      <div className="flex items-center justify-between gap-3 md:block">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
          row.tone === "gold"
            ? "border-amber-300/25 bg-amber-300/12 text-amber-100"
            : "border-white/10 bg-white/[0.055] text-slate-200"
        }`}>
          {rank}
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 md:hidden">Rank</div>
      </div>
      <div className="mt-3 min-w-0 md:mt-0">
        <div className="text-sm font-semibold text-white">{row.player}</div>
        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
          {row.badge}
        </div>
      </div>
      <MobileLabel label="Staked" value={row.staked} />
      <MobileLabel label="Weight" value={row.weight} />
      <div className={`mt-3 rounded-full border px-2.5 py-1 text-[11px] md:mt-0 md:text-center ${badgeClass}`}>
        {row.status}
      </div>
    </div>
  );
}

function CommunityTreasuryTile({
  treasury,
  className = "",
}: {
  treasury: CommunityTreasurySnapshot;
  className?: string;
}) {
  return (
    <section className={`rounded-[1.55rem] border border-emerald-300/22 bg-[radial-gradient(circle_at_88%_12%,rgba(52,211,153,0.14),transparent_30%),linear-gradient(180deg,rgba(6,18,15,0.86),rgba(4,7,14,0.99))] p-5 shadow-[0_26px_85px_rgba(2,6,23,0.28)] sm:p-6 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-emerald-100/65">
            Community Treasury
          </div>
          <div className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {treasury.balanceLabel}
          </div>
        </div>
        <div className="rounded-full border border-emerald-300/20 bg-emerald-500/10 p-3 text-emerald-100">
          <Landmark className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5">
        <TreasuryActions
          address={treasury.address}
          addressLabel={treasury.shortAddress}
          proofUrl={treasury.proofUrl}
          label="community treasury"
        />
      </div>
    </section>
  );
}

function StakingWalletTrustTile({
  wallet,
  visibleReserveWolo,
  requiredReserveWolo,
}: {
  wallet: TrustWalletSnapshot;
  visibleReserveWolo: number | null;
  requiredReserveWolo: number;
}) {
  return (
    <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Staking Wallet
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">{wallet.balanceLabel}</div>
        </div>
        <div className="rounded-full border border-sky-300/20 bg-sky-500/10 p-2.5 text-sky-100">
          <Wallet className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3">
        <TreasuryActions
          address={wallet.address}
          addressLabel={wallet.shortAddress}
          proofUrl={wallet.proofUrl}
          label="staking wallet"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs">
        <div>
          <div className="uppercase tracking-[0.18em] text-slate-500">Reserve</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {formatWolo(requiredReserveWolo, { compact: false, decimals: 0 })} required
          </div>
        </div>
        <span className="font-semibold text-slate-200">
          {visibleReserveWolo == null
            ? "--"
            : formatWolo(visibleReserveWolo, { compact: false, decimals: 0 })}
        </span>
      </div>
    </section>
  );
}

function SplitRow({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "amber" | "emerald" | "white" | "slate";
}) {
  const valueClass =
    tone === "amber"
      ? "text-amber-100"
      : tone === "emerald"
        ? "text-emerald-100"
        : tone === "white"
          ? "text-white"
          : "text-slate-200";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}

function RewardCard({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-5">
      <div className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 p-2 text-amber-100">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{copy}</p>
    </div>
  );
}

function FormulaTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.045] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-400">{helper}</div> : null}
    </div>
  );
}

function MobileLabel({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm md:mt-0 md:block">
      <span className="text-xs uppercase tracking-[0.2em] text-slate-500 md:hidden">{label}</span>
      <span className="font-semibold text-slate-200">{value}</span>
    </div>
  );
}

function TrustCard({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.04] p-4">
      <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-500/10 p-2 text-emerald-100">
        <CheckCircle2 className="h-4 w-4" />
      </div>
      <h3 className="mt-3 font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-slate-400">{copy}</p>
    </div>
  );
}
