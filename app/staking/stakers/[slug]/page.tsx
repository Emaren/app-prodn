
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Coins,
  Crown,
  Flame,
  Landmark,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Wallet,
} from "lucide-react";

import { getPrisma } from "@/lib/prisma";
import StakerLedgerPanel from "./StakerLedgerPanel";
import CopyableWalletAddress, { WalletOwnerBalance } from "./CopyableWalletAddress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type RegistryProfile = {
  slug: string;
  player: string;
  title: string;
  lane: string;
  line: string;
  badge: string;
  tone: "gold" | "emerald" | "sky";
  fallbackStake: number;
  fallbackWeight: string;
  nextMove: string;
};

type PositionRow = {
  user_id: number | null;
  player: string | null;
  wallet_address: string | null;
  current_staked_wolo: number | string | null;
  accumulated_weight: bigint | number | string | null;
  created_at: Date | string | null;
  auto_compound_rewards: boolean | null;
  status: string | null;
  lifetime_rewards_wolo: number | string | null;
  claimed_rewards_wolo: number | string | null;
  compounded_rewards_wolo: number | string | null;
  pending_rewards_wolo: number | string | null;
  micro_reward_carry_uwolo: number | string | null;
};

type AllocationRow = {
  id: number;
  reward_wolo: number | string | null;
  status: string | null;
  occurred_at: Date | string | null;
  distribution_date: Date | string | null;
};

const REGISTRY: Record<string, RegistryProfile> = {
  jim: {
    slug: "jim",
    player: "Jim",
    title: "First Guardian",
    lane: "Crown Lane",
    line: "The first guardian keeps the gate.",
    badge: "Mainnet Founder",
    tone: "gold",
    fallbackStake: 211_300,
    fallbackWeight: "104K",
    nextMove: "Hold the crown through 30 active reward cycles.",
  },
  "julio-alvarez": {
    slug: "julio-alvarez",
    player: "Julio Alvarez",
    title: "First Scout",
    lane: "Early Seat",
    line: "The first scout lit the road.",
    badge: "Watcher Pioneer",
    tone: "emerald",
    fallbackStake: 100_300,
    fallbackWeight: "54K",
    nextMove: "Compound seven cycles to earn Flame Keeper.",
  },
  emaren: {
    slug: "emaren",
    player: "Emaren",
    title: "Operator Founder",
    lane: "Verified Grind",
    line: "Operator founder, verified grind.",
    badge: "Verified Wallet",
    tone: "sky",
    fallbackStake: 101,
    fallbackWeight: "115",
    nextMove: "Keep the rails alive and push the hall forward.",
  },
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compactWolo(value: number) {
  if (!Number.isFinite(value)) return "0 WOLO";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M WOLO`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K WOLO`;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`;
}

function preciseWolo(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return `${(0).toFixed(decimals)} WOLO`;

  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} WOLO`;
}

function compactWeight(value: number | string | null | undefined) {
  const numericValue = Number(value || 0);

  if (!Number.isFinite(numericValue) || numericValue <= 0) return "0";

  const abs = Math.abs(numericValue);

  if (abs >= 1_000_000_000) {
    return `${(numericValue / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}B`;
  }

  if (abs >= 1_000_000) {
    return `${(numericValue / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  }

  if (abs >= 1_000) {
    return `${(numericValue / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  }

  return numericValue.toLocaleString(undefined, { maximumFractionDigits: 0 });
}


function shortAddress(address?: string | null) {
  if (!address) return "Wallet pending";
  return address.length > 18 ? `${address.slice(0, 10)}...${address.slice(-6)}` : address;
}



async function loadMicroCarryWolo(userId?: number | string | null) {
  const numericUserId = Number(userId || 0);
  if (!Number.isFinite(numericUserId) || numericUserId <= 0) return 0;

  const prisma = getPrisma();

  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ micro_reward_carry_uwolo: number | string | null }>>(
      `
        select micro_reward_carry_uwolo
        from staking_positions
        where user_id = $1
        limit 1
      `,
      numericUserId,
    );

    return asNumber(rows[0]?.micro_reward_carry_uwolo) / 1_000_000;
  } catch {
    return 0;
  }
}




function dateLabel(value?: Date | string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function toneCard(tone: RegistryProfile["tone"]) {
  if (tone === "gold") {
    return "border-amber-300/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(3,7,18,0.98))]";
  }
  if (tone === "emerald") {
    return "border-emerald-800/70 bg-[radial-gradient(circle_at_top_left,rgba(6,95,70,0.20),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(3,7,18,0.98))]";
  }
  return "border-sky-300/25 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(3,7,18,0.98))]";
}

function toneBadge(tone: RegistryProfile["tone"]) {
  if (tone === "gold") return "border-amber-300/30 bg-amber-300/12 text-amber-100";
  if (tone === "emerald") return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
  return "border-sky-300/20 bg-sky-500/10 text-sky-100";
}

async function loadPosition(slug: string) {
  const fallback = REGISTRY[slug];
  if (!fallback) return null;

  try {
    const prisma = getPrisma();
    const rows = await prisma.$queryRawUnsafe<PositionRow[]>(`
      select
        sp.user_id,
        coalesce(u.in_game_name, u.steam_persona_name, u.uid::text, 'Unknown Staker') as player,
        coalesce(sp.wallet_address, u.wallet_address) as wallet_address,
        sp.current_staked_wolo,
        sp.accumulated_weight,
        sp.created_at,
        sp.auto_compound_rewards,
        sp.status,
        sp.lifetime_rewards_wolo,
        sp.claimed_rewards_wolo,
        sp.compounded_rewards_wolo,
        sp.pending_rewards_wolo
      from staking_positions sp
      left join users u on u.id = sp.user_id
      where coalesce(sp.current_staked_wolo, 0) > 0
      order by sp.current_staked_wolo desc, sp.created_at asc
      limit 200
    `);

    const ranked = rows.map((row, index) => ({
      row,
      rank: index + 1,
      slug: slugify(row.player || ""),
    }));

    const match = ranked.find((item) => item.slug === slug);
    if (!match) {
      return {
        registry: fallback,
        row: null,
        rank: fallback.slug === "jim" ? 1 : fallback.slug === "julio-alvarez" ? 2 : 3,
        totalStake: rows.reduce((sum, item) => sum + asNumber(item.current_staked_wolo), 0),
        allocations: [] as AllocationRow[],
      };
    }

    const allocations =
      match.row.user_id == null
        ? []
        : await prisma.$queryRawUnsafe<AllocationRow[]>(
            `
            select
              a.id,
              a.reward_wolo,
              a.status,
              coalesce(a.credited_at, a.claimed_at, a.created_at, d.created_at) as occurred_at,
              d.distribution_date
            from staking_reward_allocations a
            join staking_reward_distributions d on d.id = a.distribution_id
            where a.user_id = $1
              and d.distribution_date::date >= '2026-05-25'::date
            order by coalesce(a.credited_at, a.claimed_at, a.created_at, d.created_at) desc, a.id desc
            limit 18
            `,
            match.row.user_id
          );

    return {
      registry: fallback,
      row: match.row,
      rank: match.rank,
      totalStake: rows.reduce((sum, item) => sum + asNumber(item.current_staked_wolo), 0),
      allocations,
    };
  } catch (error) {
    console.warn("Failed to load staker hall profile:", error);
    return {
      registry: fallback,
      row: null,
      rank: fallback.slug === "jim" ? 1 : fallback.slug === "julio-alvarez" ? 2 : 3,
      totalStake: 311_701,
      allocations: [] as AllocationRow[],
    };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const profile = REGISTRY[slug];

  return {
    title: profile ? `${profile.player} · Staking Hall` : "Staker Not Found",
    description: profile ? `${profile.player}'s WOLO staking hall profile.` : undefined,
  };
}

function StatCard({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  tone: RegistryProfile["tone"];
  icon: React.ReactNode;
}) {
  return (
    <div className={`rounded-[1.35rem] border p-4 shadow-[0_20px_70px_rgba(2,6,23,0.25)] ${toneCard(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
          <div className="mt-1 text-xs text-slate-400">{helper}</div>
        </div>
        <div className={`rounded-full border p-2.5 ${toneBadge(tone)}`}>{icon}</div>
      </div>
    </div>
  );
}

export default async function StakerHallPage({ params }: PageProps) {
  const { slug } = await params;
  const profile = await loadPosition(slug);

  if (!profile) notFound();

  const { registry, row, rank, totalStake, allocations } = profile;
  const stake = row ? asNumber(row.current_staked_wolo, registry.fallbackStake) : registry.fallbackStake;
  const weight = row?.accumulated_weight != null ? String(row.accumulated_weight) : registry.fallbackWeight;
  const share = totalStake > 0 ? `${((stake / totalStake) * 100).toFixed(2)}%` : "Founding";
  const wallet = row?.wallet_address || null;
  const joined = row?.created_at || null;
  const autoCompound = row?.auto_compound_rewards ?? true;
  const claimed = row ? asNumber(row.claimed_rewards_wolo) : 0;
  const compounded = row ? asNumber(row.compounded_rewards_wolo) : 0;
  const seatSize = stake + compounded;
  const microCarryWolo = await loadMicroCarryWolo(row?.user_id);
  const lifetime = Math.max(row ? asNumber(row.lifetime_rewards_wolo) : 0, allocations.reduce((sum, item) => sum + asNumber(item.reward_wolo), 0));
  const rawPending = row ? asNumber(row.pending_rewards_wolo) : 0;
  const microCarry = microCarryWolo;
  const allocationDust = allocations.reduce((sum, item) => {
    const reward = asNumber(item.reward_wolo);
    const status = String(item.status || "").toLowerCase();

    if (reward > 0 && reward < 1 && (status.includes("micro") || status.includes("held") || status.includes("pending"))) {
      return sum + reward;
    }

    return sum;
  }, 0);
  const derivedPending = Math.max(0, lifetime - claimed - compounded);
  const pending =
    rawPending > 0
      ? rawPending
      : microCarry > 0.000001
        ? microCarry
        : allocationDust > 0.000001
          ? allocationDust
          : derivedPending > 0.000001
            ? derivedPending
            : 0;
  const championshipTitle = registry.slug === "jim" ? "USA National Champion" : registry.slug === "julio-alvarez" ? "Mexico National Champion" : "Verified Grind";
  const kingdomBenefit = registry.slug === "jim" ? "US Champion lane · founding staking guardian · public kingdom proof" : registry.slug === "julio-alvarez" ? "Mexico Champion lane · first scout · early staking proof" : "Operator lane · verified wallet · public economy rail";
  const designationRows: Array<{ label: string; meta: string; value: string; tone: "gold" | "emerald" | "sky" }> = [
    ...(registry.slug === "jim"
      ? [{ label: "USA National Champion", meta: "National belt", value: "75 WOLO/mo", tone: "gold" as const }]
      : registry.slug === "julio-alvarez"
        ? [{ label: "Mexico National Champion", meta: "National belt", value: "75 WOLO/mo", tone: "gold" as const }]
        : []),
    { label: registry.title, meta: registry.lane, value: registry.badge, tone: registry.tone },
    { label: autoCompound ? "Auto-compound" : "Manual claim", meta: "Staking mode", value: compactWolo(seatSize), tone: "emerald" },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,rgba(30,64,175,0.24),transparent_34%),linear-gradient(180deg,#081224,#02040a_72%)] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/staking"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition hover:border-amber-300/35 hover:text-amber-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to staking room
        </Link>

        <section className={`mt-6 rounded-[2rem] border p-6 shadow-[0_28px_110px_rgba(2,6,23,0.48)] sm:p-8 ${toneCard(registry.tone)}`}>
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                <Crown className="h-3.5 w-3.5" />
                Staking Hall · Rank #{rank}
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-6xl">{registry.player}</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">{registry.line}</p>

              <div className="mt-6 flex flex-wrap gap-2">
                {[registry.title, registry.lane, registry.badge, autoCompound ? "Auto-compound" : "Manual claim"].map((badge) => (
                  <span
                    key={badge}
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${toneBadge(registry.tone)}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
              <div className={`inline-flex rounded-full border p-3 ${toneBadge(registry.tone)}`}>
                {registry.slug === "jim" ? <ShieldCheck className="h-6 w-6" /> : registry.slug === "julio-alvarez" ? <Swords className="h-6 w-6" /> : <Flame className="h-6 w-6" />}
              </div>
              <div className="mt-4 text-[11px] uppercase tracking-[0.24em] text-slate-500">Wallet</div>
              <CopyableWalletAddress address={wallet} label={shortAddress(wallet)} />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Your balance</div>
                  <WalletOwnerBalance address={wallet} />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Joined</div>
                  <div className="mt-1 text-sm font-semibold text-white">{dateLabel(joined)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Seat size" value={preciseWolo(seatSize, 2)} helper="Principal + rewards" tone="gold" icon={<Coins className="h-4 w-4" />} />
          <StatCard label="Weight" value={compactWeight(weight)} helper="Accounting weight" tone="sky" icon={<Sparkles className="h-4 w-4" />} />
          <StatCard label="Hall share" value={share} helper="Of visible active stake" tone="emerald" icon={<Landmark className="h-4 w-4" />} />
          <StatCard label="Reward Total" value={compactWolo(lifetime)} helper="All time earnings" tone="gold" icon={<Trophy className="h-4 w-4" />} />
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Auto-compounded" value={compactWolo(compounded)} helper="Included in seat size" tone="gold" icon={<Crown className="h-4 w-4" />} />
          <StatCard label="Paid Out" value={compactWolo(claimed)} helper="All time" tone="emerald" icon={<Wallet className="h-4 w-4" />} />
          <StatCard
            label="Building"
            value={
              pending > 0 && pending < 1
                ? `${pending.toLocaleString(undefined, { maximumFractionDigits: 6 })} WOLO`
                : compactWolo(pending)
            }
            helper={pending > 0 && pending < 1 ? "Dust under threshold" : "Below reward threshold"}
            icon={<Flame className="h-4 w-4" />}
            tone="gold"
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.55rem] border border-amber-300/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(3,7,18,0.98))] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-amber-200/60">Championships</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">{championshipTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Titles, rewards, and receipts live together here.
                </p>
              </div>
              <div className="rounded-full border border-amber-300/25 bg-amber-300/10 p-3 text-amber-100">
                <Trophy className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-[1.55rem] border border-emerald-800/70 bg-[radial-gradient(circle_at_top_left,rgba(6,95,70,0.18),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(3,7,18,0.98))] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-emerald-100/60">Kingdom Benefits</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Public seat benefits</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{kingdomBenefit}</p>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-500/10 p-3 text-emerald-100">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(3,7,18,0.98))] p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Designations Held</div>
            <div className="rounded-full border border-amber-300/25 bg-amber-300/10 p-2 text-amber-100">
              <Crown className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {designationRows.map((item) => (
              <div
                key={`${item.label}-${item.meta}`}
                className={`rounded-2xl border p-4 ${
                  item.tone === "gold"
                    ? "border-amber-300/25 bg-amber-300/10"
                    : item.tone === "emerald"
                      ? "border-emerald-300/20 bg-emerald-500/10"
                      : "border-sky-300/20 bg-sky-500/10"
                }`}
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.meta}</div>
                <div className="mt-2 text-lg font-semibold text-white">{item.label}</div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">{item.value}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6">
          <StakerLedgerPanel
          slug={slug}
          player={registry.player}
          rewardStats={{
            lifetime,
            compounded,
            claimed,
            pending,
          }}
        />
        </div>
      </div>
    </main>
  );
}
