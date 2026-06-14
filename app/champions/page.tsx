import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  Coins,
  Crown,
  Flame,
  Hourglass,
  Medal,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Timer,
  Trophy,
} from "lucide-react";

import {
  championBelts,
  eloBelts,
  specialDesignations,
  type ChampionBelt,
} from "@/lib/aoe2warLeague";

export const metadata: Metadata = {
  title: "Championship Belts",
  description: "AoE2WAR titles, championship belts, national reigns, and belt economy.",
};

const accentClasses: Record<ChampionBelt["accent"], string> = {
  gold: "from-amber-200 via-yellow-500 to-orange-900 border-amber-200/45 text-amber-50",
  blue: "from-sky-200 via-blue-500 to-indigo-950 border-sky-200/35 text-sky-50",
  green: "from-emerald-200 via-emerald-600 to-stone-950 border-emerald-200/32 text-emerald-50",
  violet: "from-violet-200 via-purple-600 to-stone-950 border-violet-200/35 text-violet-50",
  silver: "from-slate-100 via-slate-500 to-stone-950 border-slate-200/30 text-slate-50",
  red: "from-rose-200 via-red-700 to-stone-950 border-rose-200/32 text-rose-50",
};

function formatWolo(value: number) {
  return value.toLocaleString();
}

function BeltIllustration({ belt }: { belt: ChampionBelt }) {
  const accent = accentClasses[belt.accent];
  return (
    <div className="relative mx-auto h-28 w-full max-w-[22rem]">
      <div className="absolute left-1 top-11 h-12 w-[38%] rounded-l-full border border-white/12 bg-[linear-gradient(135deg,rgba(5,8,12,0.96),rgba(37,27,16,0.72))] shadow-[inset_0_0_16px_rgba(255,255,255,0.05)]" />
      <div className="absolute right-1 top-11 h-12 w-[38%] rounded-r-full border border-white/12 bg-[linear-gradient(225deg,rgba(5,8,12,0.96),rgba(37,27,16,0.72))] shadow-[inset_0_0_16px_rgba(255,255,255,0.05)]" />
      <div className={`absolute left-1/2 top-2 flex h-24 w-24 -translate-x-1/2 items-center justify-center rounded-full border bg-gradient-to-br ${accent} shadow-[0_0_46px_rgba(245,158,11,0.18),inset_0_0_26px_rgba(0,0,0,0.28)]`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-black/28 bg-black/22">
          <Crown className="h-9 w-9 text-inherit drop-shadow" />
        </div>
      </div>
      <div className={`absolute left-[20%] top-10 flex h-14 w-14 items-center justify-center rounded-full border bg-gradient-to-br ${accent} opacity-85`}>
        <Shield className="h-6 w-6" />
      </div>
      <div className={`absolute right-[20%] top-10 flex h-14 w-14 items-center justify-center rounded-full border bg-gradient-to-br ${accent} opacity-85`}>
        <Swords className="h-6 w-6" />
      </div>
    </div>
  );
}

function ChampionCard({ belt, compact = false }: { belt: ChampionBelt; compact?: boolean }) {
  const isHeld = belt.status === "held";
  const isFeatured = belt.featured;

  return (
    <article
      className={`relative overflow-hidden rounded-[1.7rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.20)),radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.14),transparent_34%)] p-4 shadow-[0_28px_90px_rgba(0,0,0,0.34)] ${
        isFeatured ? "border-amber-200/45 lg:col-span-2" : "border-white/10"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-6 top-10 h-px bg-gradient-to-r from-transparent via-amber-200/36 to-transparent" />
      <div className="relative z-10 text-center">
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-100/78">{belt.division}</div>
        <h2 className="mt-2 font-serif text-2xl font-semibold uppercase tracking-[0.08em] text-amber-50">
          {belt.title}
        </h2>
      </div>

      <BeltIllustration belt={belt} />

      <div className="relative z-10 rounded-[1.25rem] border border-white/10 bg-black/26 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={`${compact ? "text-lg" : "text-2xl"} font-semibold text-white`}>
                {belt.champion}
              </h3>
              {belt.note ? (
                <span className="rounded-full border border-amber-200/22 bg-amber-300/12 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-100">
                  {belt.note}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-400">{belt.subtitle}</p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              isHeld
                ? "border-emerald-300/24 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/18 bg-amber-400/10 text-amber-100"
            }`}
          >
            {isHeld ? "Held" : belt.status === "vacant" ? "Vacant" : "Coming soon"}
          </span>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Reign</div>
            <div className="mt-1 text-sm font-semibold text-white">
              {belt.reignDays != null ? `${belt.reignDays} days` : "Unclaimed"}
            </div>
          </div>
          <div className="rounded-[1rem] border border-white/8 bg-white/[0.035] px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Monthly Reward</div>
            <div className="mt-1 text-sm font-semibold text-amber-100">
              {formatWolo(belt.monthlyRewardWolo)} WOLO
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function RuleRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Shield;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-[1.15rem] border border-white/8 bg-white/[0.035] p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/16 bg-amber-300/10 text-amber-100">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-400">{body}</div>
      </div>
    </div>
  );
}

export default function ChampionsPage() {
  const activeCount = championBelts.filter((belt) => belt.status === "held").length;
  const vacantCount = [...championBelts, ...eloBelts].filter((belt) => belt.status !== "held").length;
  const monthlyBudget = [...championBelts, ...eloBelts].reduce(
    (sum, belt) => sum + belt.monthlyRewardWolo,
    0
  );

  return (
    <main className="space-y-7 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.24),transparent_26%),radial-gradient(circle_at_15%_16%,rgba(59,130,246,0.14),transparent_22%),linear-gradient(145deg,#130d08,#071019_48%,#050507)] px-5 py-12 text-center shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:px-8">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/50 to-transparent" />
        <div className="mx-auto flex max-w-4xl flex-col items-center">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.34em] text-amber-100/74">
            <Crown className="h-4 w-4" />
            AoE2WAR
          </div>
          <h1 className="mt-4 font-serif text-5xl font-semibold uppercase tracking-[0.12em] text-amber-50 sm:text-7xl">
            Championship Belts
          </h1>
          <p className="mt-5 max-w-3xl text-base uppercase tracking-[0.26em] text-slate-300 sm:text-lg">
            Earn the title. Defend your legacy. Claim the rewards.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
            <span className="rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-amber-100">
              Titles, reigns, challenges
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-slate-300">
              Monthly WOLO rewards
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-4">
        {championBelts.map((belt) => (
          <ChampionCard key={belt.id} belt={belt} />
        ))}
      </section>

      <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Medal className="h-4 w-4" />
              Division Champions
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">ELO belts</h2>
          </div>
          <Link
            href="/bets"
            className="rounded-full border border-amber-200/18 bg-amber-300/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-300/16"
          >
            Challenge through Bets
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {eloBelts.map((belt) => (
            <ChampionCard key={belt.id} belt={belt} compact />
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.22))] p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
            <Skull className="h-4 w-4" />
            Special Designations
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-white">Style earns legend.</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {specialDesignations.map((designation) => (
              <div
                key={designation.title}
                className="rounded-[1.25rem] border border-amber-200/14 bg-black/24 p-4"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-100">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-amber-100">
                  {designation.title}
                </div>
                <p className="mt-2 min-h-[3rem] text-sm leading-6 text-slate-400">{designation.body}</p>
                <div className="mt-3 text-sm font-semibold text-white">
                  {designation.rewardWolo} WOLO bonus
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-5">
          <section className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Trophy className="h-4 w-4" />
              How Titles Work
            </div>
            <div className="mt-4 grid gap-3">
              <RuleRow icon={Shield} title="Contender Status Required" body="Be ranked. Be active. Earn your shot." />
              <RuleRow icon={Timer} title="24h To Respond" body="Challenged? Acknowledge the callout within 24 hours." />
              <RuleRow icon={Hourglass} title="7 Days To Defend" body="Defend your belt within 7 days or forfeit." />
              <RuleRow icon={Activity} title="30 Day Rematch Cooldown" body="After a loss, wait 30 days unless the champion accepts sooner." />
              <RuleRow icon={Flame} title="Activity Keeps The Crown" body="Belts are earned by winning, kept by activity, and lost by defeat, inactivity, or ducking." />
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Coins className="h-4 w-4" />
              Belt Economy
            </div>
            <div className="mt-5 grid gap-3">
              <EconomyRow label="Active belts" value={String(activeCount)} />
              <EconomyRow label="Vacant titles" value={String(vacantCount)} />
              <EconomyRow label="Monthly purse" value={`${formatWolo(monthlyBudget)} WOLO`} />
              <EconomyRow label="Champion bounties" value="grow by time held" />
              <EconomyRow label="Inactivity" value="pauses bounty growth" />
              <EconomyRow label="Title-change bonus" value="capped" />
            </div>
          </section>
        </div>
      </section>

      <section className="grid gap-4 rounded-[1.8rem] border border-amber-200/14 bg-[linear-gradient(90deg,rgba(120,71,16,0.22),rgba(0,0,0,0.18))] p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.28em] text-amber-100/72">National beacons</div>
          <h2 className="mt-2 text-2xl font-semibold text-white">The map is already burning.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            World Champion can hold a nation, but the ecosystem leaves room for ELO belts, team belts,
            and style titles to be claimed by the next wave.
          </p>
        </div>
        <Link
          href="/national-champions"
          className="inline-flex items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          View National Champions
        </Link>
      </section>
    </main>
  );
}

function EconomyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-white/[0.035] px-4 py-3">
      <span className="text-sm text-slate-300">{label}</span>
      <span className="text-sm font-semibold text-amber-100">{value}</span>
    </div>
  );
}
