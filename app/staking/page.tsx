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
  Swords,
  Trophy,
  Users,
} from "lucide-react";

import { getPrisma } from "@/lib/prisma";
import StakingWalletPanel from "./StakingWalletPanel";

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
const BETTING_FEE_RATE = 0.0075;
const STAKER_SHARE = 0.5;

type PeriodKey = "24h" | "7d" | "30d" | "all";
type BoardKey = "stakers" | "earners" | "rewards";

type StakingSearchParams = Promise<{
  period?: string | string[];
  board?: string | string[];
}>;

type ActivityItem = {
  label: string;
  detail: string;
  meta: string;
  tone: "amber" | "emerald" | "sky" | "slate";
};

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
  activity: ActivityItem[];
};

type BoardRow = {
  player: string;
  badge: string;
  staked: string;
  rewards: string;
  status: string;
  tone: "gold" | "emerald" | "sky" | "slate";
};

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

const BOARD_ROWS: Record<
  BoardKey,
  BoardRow[]
> = {
  stakers: [
    { player: "Founder Seat", badge: "Crown lane", staked: "Ledger pending", rewards: "Modeled", status: "Top seat", tone: "gold" },
    { player: "Early Backer", badge: "First wave", staked: "Ledger pending", rewards: "Modeled", status: "Ready soon", tone: "emerald" },
    { player: "Verified Grinder", badge: "Match regular", staked: "Ledger pending", rewards: "Modeled", status: "Open slot", tone: "sky" },
    { player: "War Chest Leader", badge: "Top earner", staked: "Ledger pending", rewards: "Modeled", status: "Unclaimed", tone: "slate" },
  ],
  earners: [
    { player: "Top Earner", badge: "Crown lane", staked: "Ledger pending", rewards: "Modeled", status: "Preview", tone: "gold" },
    { player: "Fee Hunter", badge: "Daily share", staked: "Ledger pending", rewards: "Modeled", status: "Preview", tone: "emerald" },
    { player: "Match Regular", badge: "Steady heat", staked: "Ledger pending", rewards: "Modeled", status: "Preview", tone: "sky" },
    { player: "New Backer", badge: "Open seat", staked: "Ledger pending", rewards: "Modeled", status: "Preview", tone: "slate" },
  ],
  rewards: [
    { player: "Daily Pool", badge: "Preparing", staked: "0.75% fee", rewards: "50% share", status: "Stakers", tone: "gold" },
    { player: "Treasury", badge: "Community", staked: "0.75% fee", rewards: "50% share", status: "Visible", tone: "emerald" },
    { player: "Next Match", badge: "Settles soon", staked: "Open", rewards: "Feeds pool", status: "Live loop", tone: "sky" },
    { player: "Reward Cutover", badge: "Ledger", staked: "Pending", rewards: "Preparing", status: "Next", tone: "slate" },
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

function getPeriodStart(period: PeriodKey) {
  const config = PERIODS.find((item) => item.key === period);
  if (!config?.days) return null;
  return new Date(Date.now() - config.days * 24 * 60 * 60 * 1000);
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
  options: { approximate?: boolean; compact?: boolean; decimals?: number } = {}
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

  return `${options.approximate ? "≈" : ""}${formatted} WOLO`;
}

function formatFeeShareWolo(value: number | null) {
  return formatWolo(value, { approximate: true, compact: false, decimals: 2 });
}

function stakerEarnedLabel(period: PeriodKey) {
  if (period === "24h") return "Today Stakers Earned";
  if (period === "7d") return "7D Stakers Earned";
  if (period === "30d") return "30D Stakers Earned";
  return "All-Time Stakers Earned";
}

function formatMoment(value: Date) {
  return value.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function displayPlayerName(input: {
  inGameName: string | null;
  steamPersonaName: string | null;
  uid: string;
}) {
  return input.inGameName?.trim() || input.steamPersonaName?.trim() || input.uid;
}

async function loadEconomySnapshot(period: PeriodKey): Promise<EconomySnapshot> {
  const prisma = getPrisma();
  const periodStart = getPeriodStart(period);
  const wagerWhere = periodStart ? { createdAt: { gte: periodStart } } : {};
  const settledWhere = periodStart
    ? { settledAt: { gte: periodStart } }
    : { settledAt: { not: null } };
  const activeUserWhere = periodStart ? { lastSeen: { gte: periodStart } } : {};

  const [
    wagerAggregate,
    settledAggregate,
    payoutAggregate,
    activeBettorRows,
    activePlayers,
    recentWagers,
  ] = await Promise.all([
    prisma.betWager.aggregate({
      where: wagerWhere,
      _count: { _all: true },
      _sum: { amountWolo: true },
    }),
    prisma.betWager.aggregate({
      where: settledWhere,
      _sum: { amountWolo: true },
    }),
    prisma.betWager.aggregate({
      where: settledWhere,
      _sum: { payoutWolo: true },
    }),
    prisma.betWager.findMany({
      where: wagerWhere,
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.user.count({ where: activeUserWhere }),
    prisma.betWager.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        amountWolo: true,
        payoutWolo: true,
        status: true,
        side: true,
        createdAt: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
        market: {
          select: {
            title: true,
            leftLabel: true,
            rightLabel: true,
          },
        },
      },
    }),
  ]);

  const settledVolumeWolo = settledAggregate._sum.amountWolo ?? 0;
  const bettingFeePool = settledVolumeWolo * BETTING_FEE_RATE;
  const stakerFeePoolWolo = bettingFeePool * STAKER_SHARE;
  const treasuryShareWolo = bettingFeePool * (1 - STAKER_SHARE);

  const activity: ActivityItem[] = [];

  if (stakerFeePoolWolo > 0) {
    activity.push({
      label: `${formatFeeShareWolo(stakerFeePoolWolo)} modeled for stakers`,
      detail: "50% share from settled betting fees.",
      meta: "Fee model",
      tone: "amber",
    });
  }

  if (treasuryShareWolo > 0) {
    activity.push({
      label: `${formatFeeShareWolo(treasuryShareWolo)} modeled for treasury`,
      detail: "Matching 50% share for the Community Treasury.",
      meta: "Fee model",
      tone: "emerald",
    });
  }

  for (const wager of recentWagers) {
    const player = displayPlayerName(wager.user);
    const pickedLabel = wager.side === "right" ? wager.market.rightLabel : wager.market.leftLabel;
    const matchLabel = `${wager.market.leftLabel} vs ${wager.market.rightLabel}`;
    const isWin = wager.status === "won" && (wager.payoutWolo ?? 0) > 0;
    activity.push({
      label: isWin
        ? `${formatWolo(wager.payoutWolo ?? 0)} payout: ${matchLabel}`
        : `${formatWolo(wager.amountWolo)} wager: ${matchLabel}`,
      detail: isWin ? `${player} won on ${pickedLabel}` : `${player} picked ${pickedLabel}`,
      meta: formatMoment(wager.createdAt),
      tone: isWin ? "emerald" : "sky",
    });
  }

  if (activity.length === 0) {
    activity.push({
      label: "Recent activity is warming up",
      detail: "Settled matches, treasury movement, and staking rewards will land here.",
      meta: "Standby",
      tone: "slate",
    });
  }

  return {
    period,
    generatedAt: new Date().toISOString(),
    dataLive: true,
    betsPlaced: wagerAggregate._count._all,
    betVolumeWolo: wagerAggregate._sum.amountWolo ?? 0,
    payoutWolo: payoutAggregate._sum.payoutWolo ?? 0,
    settledVolumeWolo,
    stakerFeePoolWolo,
    treasuryShareWolo,
    activeBettors: activeBettorRows.length,
    activePlayers,
    activity: activity.slice(0, 7),
  };
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

export default async function StakingPage({
  searchParams,
}: {
  searchParams?: StakingSearchParams;
}) {
  const resolvedSearchParams = await searchParams;
  const period = normalizePeriod(resolvedSearchParams?.period);
  const board = normalizeBoard(resolvedSearchParams?.board);
  const periodLabel = PERIODS.find((item) => item.key === period)?.label ?? "24H";

  let snapshot: EconomySnapshot;
  try {
    snapshot = await loadEconomySnapshot(period);
  } catch (error) {
    console.warn("Failed to load staking economy snapshot:", error);
    snapshot = fallbackSnapshot(period);
  }

  return (
    <main className="space-y-6 py-3 text-white sm:space-y-7 sm:py-4">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_12%_18%,rgba(251,191,36,0.2),transparent_24%),radial-gradient(circle_at_86%_12%,rgba(16,185,129,0.16),transparent_24%),radial-gradient(circle_at_70%_86%,rgba(148,163,184,0.12),transparent_22%),linear-gradient(135deg,#07101d,#111827_52%,#040712)] p-5 shadow-[0_42px_120px_rgba(2,6,23,0.45)] sm:p-7 lg:p-9">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.6),transparent)]" />
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-amber-300/10" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-24 w-full bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.2))]" />

        <div className="relative z-10 grid gap-7 xl:grid-cols-[1.02fr_0.98fr] xl:items-start">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <HeroPill tone="amber">0.75% betting fee</HeroPill>
              <HeroPill tone="emerald">50% to stakers</HeroPill>
              <HeroPill tone="slate">No lockups</HeroPill>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <WoloMark />
                <div className="text-xs uppercase tracking-[0.34em] text-amber-200/75">
                  WOLO Economy
                </div>
              </div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                Stake WOLO. Earn from Real Matches.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                Stakers receive 50% of betting fees, paid from real AoE2HDBets activity. No fake APY. No lockups. Just WOLO working while matches settle.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/profile" className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">
                Stake WOLO
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/profile" className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 py-3 text-sm text-white/90 transition hover:border-white/25 hover:bg-white/10 hover:text-white">
                View Rewards
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroStat label="Instant Stake" value="Ready" helper="No long lockups" />
              <HeroStat label="Staking Weight" value="More WOLO + time" helper="More rewards" />
              <HeroStat label="Fee Split" value="50 / 50" helper="Stakers and treasury" />
            </div>
          </div>

          <section className="rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.94),rgba(3,6,12,0.98))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-white/45">
                  War Chest Pulse
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  {periodLabel} economy
                </h2>
              </div>
              <DataBadge live={snapshot.dataLive} />
            </div>

            <div className="mt-5 rounded-[1.45rem] border border-amber-300/25 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.22),transparent_32%),linear-gradient(180deg,rgba(251,191,36,0.14),rgba(255,255,255,0.045))] p-5 shadow-[0_24px_70px_rgba(251,191,36,0.08)]">
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
              <div className="mt-4 text-sm leading-6 text-amber-50/82">
                Modeled from the 50% staker share of settled betting fees.
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <HeroStat label="Bet Volume" value={formatWolo(snapshot.betVolumeWolo)} helper={`${formatNumber(snapshot.betsPlaced)} bets`} />
              <HeroStat label="Payouts" value={formatWolo(snapshot.payoutWolo)} helper="Settled returns" />
              <HeroStat label="Bets Placed" value={formatNumber(snapshot.betsPlaced)} helper="Wagers in window" />
              <HeroStat label="Treasury Share" value={formatFeeShareWolo(snapshot.treasuryShareWolo)} helper="Modeled fee share" />
            </div>

            <div className="mt-5 rounded-[1.35rem] border border-amber-300/15 bg-amber-300/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-amber-100">Staking Weight</div>
                <div className="rounded-full border border-amber-200/20 bg-black/20 px-3 py-1 text-xs text-amber-100">
                  WOLO x time
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/35">
                <div className="h-full w-[58%] rounded-full bg-[linear-gradient(90deg,#fbbf24,#34d399)]" />
              </div>
              <p className="mt-3 text-sm leading-6 text-amber-50/80">
                More WOLO plus more time equals more reward weight.
              </p>
            </div>
          </section>
        </div>
      </section>

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
            helper="Modeled 50% fee share"
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
            helper="Modeled 50% fee share"
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
            value="--"
            helper="Ledger coming soon"
            tone="emerald"
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
        <Panel eyebrow="Betting Fee" title="Every Bet Feeds the System">
          <div className="grid gap-4 md:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[1.35rem] border border-amber-300/15 bg-amber-300/10 p-5">
              <div className="text-xs uppercase tracking-[0.26em] text-amber-100/70">
                Betting Fee
              </div>
              <div className="mt-4 text-5xl font-semibold text-amber-100">0.75%</div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-black/30">
                <div className="grid h-full grid-cols-2">
                  <div className="bg-amber-300" />
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
                <SplitRow label="Betting fee" value="150 WOLO" />
                <SplitRow label="Stakers receive" value="75 WOLO" tone="amber" />
                <SplitRow label="Treasury receives" value="75 WOLO" tone="emerald" />
                <SplitRow label="Winner receives" value="19,850 WOLO" tone="white" />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                A tiny betting fee keeps the economy alive. Half goes to stakers. Half strengthens the Community Treasury.
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
            <FormulaTile label="Daily Pool" value="50% fees" />
            <FormulaTile label="Your Share" value="Fair split" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-start">
        <Panel eyebrow="Loyalty Board" title="Staker status room">
          <div className="mb-4 flex flex-wrap gap-2">
            {BOARDS.map((item) => (
              <Link
                key={item.key}
                href={hrefFor({ period, board: item.key })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  board === item.key
                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                    : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/20 hover:bg-white/[0.075]"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="space-y-2">
            <div className="hidden rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-500 md:grid md:grid-cols-[3rem_1.3fr_1fr_1fr_0.9fr] md:gap-3">
              <div>Rank</div>
              <div>Player</div>
              <div>Staked</div>
              <div>Rewards</div>
              <div>Status</div>
            </div>
            {BOARD_ROWS[board].map((row, index) => (
              <LeaderboardRow key={`${board}-${row.player}`} rank={index + 1} row={row} />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="Recent Activity" title="War chest feed">
          <div className="space-y-3">
            {snapshot.activity.map((item, index) => (
              <ActivityRow key={`${item.label}-${index}`} item={item} />
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <TrustCard title="No Inflation" copy="Rewards come from betting fees." />
        <TrustCard title="No Lockups" copy="Stake and unstake are instant." />
        <TrustCard title="Fair Weight" copy="Reward share uses Staking Weight." />
        <TrustCard title="Visible Pools" copy="Treasury and staker revenue stay surfaced." />
        <TrustCard title="No Fake APY" copy="No emission promises. No tricks." />
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
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-300/20 bg-amber-300/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
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
    <div className={`min-h-[9.4rem] rounded-[1.35rem] border p-4 shadow-[0_18px_65px_rgba(2,6,23,0.22)] ${featured ? "border-amber-300/30 bg-[linear-gradient(180deg,rgba(251,191,36,0.14),rgba(255,255,255,0.045))]" : "border-white/10 bg-white/[0.04]"}`}>
      <div className={`inline-flex rounded-full border p-2 ${toneClass}`}>{icon}</div>
      <div className="mt-4 text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{helper}</div>
    </div>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,29,0.92),rgba(4,7,14,0.98))] p-5 shadow-[0_24px_90px_rgba(2,6,23,0.25)] sm:p-6">
      <div className="mb-5">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{eyebrow}</div>
        <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      </div>
      {children}
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

function LeaderboardRow({
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
    <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-4 md:grid md:grid-cols-[3rem_1.35fr_1fr_1fr_0.9fr] md:items-center md:gap-3">
      <div className="flex items-center justify-between gap-3 md:block">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold ${
          row.tone === "gold"
            ? "border-amber-300/25 bg-amber-300/12 text-amber-100"
            : "border-white/10 bg-white/[0.055] text-slate-200"
        }`}>
          {rank}
        </div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 md:hidden">Rank</div>
      </div>
      <div className="mt-3 min-w-0 md:mt-0">
        <div className="font-semibold text-white">{row.player}</div>
        <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${badgeClass}`}>
          {row.badge}
        </div>
      </div>
      <MobileLabel label="Staked" value={row.staked} />
      <MobileLabel label="Rewards" value={row.rewards} />
      <div className={`mt-3 rounded-full border px-3 py-1 text-xs md:mt-0 md:text-center ${badgeClass}`}>
        {row.status}
      </div>
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

function ActivityRow({ item }: { item: ActivityItem }) {
  const toneClass =
    item.tone === "amber"
      ? "bg-amber-300 text-slate-950"
      : item.tone === "emerald"
        ? "bg-emerald-300 text-slate-950"
        : item.tone === "sky"
          ? "bg-sky-300 text-slate-950"
          : "bg-slate-300 text-slate-950";

  return (
    <div className="flex gap-3 rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-4">
      <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass}`} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-white">{item.label}</div>
        <div className="mt-1 text-sm leading-6 text-slate-300">{item.detail}</div>
        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{item.meta}</div>
      </div>
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
