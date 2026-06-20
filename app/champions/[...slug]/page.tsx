import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Crown, History, Medal, Shield, Sparkles, Trophy } from "lucide-react";

import { getPrisma } from "@/lib/prisma";
import {
  findChampionTitleBySegments,
  formatDailyTribute,
  tributeLabel,
  type ChampionTitleDefinition,
  type TitleContender,
} from "@/lib/champions/titles";
import { getTitleState, loadChampionTitleEconomyState } from "@/lib/champions/titleState";

export const dynamic = "force-dynamic";

type ChampionDetailParams = {
  slug: string[];
};

export async function generateMetadata({
  params,
}: {
  params: Promise<ChampionDetailParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const title = findChampionTitleBySegments(slug);

  if (!title) {
    return {
      title: "Championship",
    };
  }

  return {
    title: `${title.displayName} | AoE2WAR`,
    description: title.rule,
  };
}

function holderLabel(title: ChampionTitleDefinition) {
  if (title.holders.length === 0) return "Vacant";
  return title.holders.map((holder) => holder.name).join(" & ");
}

function challengeHref(title: ChampionTitleDefinition) {
  const params = new URLSearchParams({
    title: title.id,
  });

  if (title.country) {
    params.set("country", title.country);
  }

  if (title.type === "national") {
    params.set("kind", "national");
  }

  return `/challenge?${params.toString()}#schedule-game`;
}

function txProofHref(txHash: string) {
  return `/api/wolo/tx/${encodeURIComponent(txHash)}`;
}

function shortTxHash(txHash: string) {
  return `${txHash.slice(0, 8)}…${txHash.slice(-6)}`;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function ChampionTitleDetailPage({
  params,
}: {
  params: Promise<ChampionDetailParams>;
}) {
  const { slug } = await params;
  const definition = findChampionTitleBySegments(slug);

  if (!definition) {
    notFound();
  }

  const economy = await loadChampionTitleEconomyState(getPrisma());
  const title = getTitleState(economy, definition);

  return (
    <main className="space-y-6 overflow-x-hidden py-5 text-white sm:py-7">
      <Link
        href="/champions"
        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.035] px-4 py-2 text-sm text-slate-200 transition hover:border-amber-200/35 hover:text-amber-100"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Champions
      </Link>

      <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_30%_0%,rgba(251,191,36,0.22),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(59,130,246,0.13),transparent_25%),linear-gradient(145deg,#120d08,#07111c_54%,#02040a)] p-5 shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:p-8">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.34em] text-amber-100/74">
              <Crown className="h-4 w-4" />
              {title.eyebrow}
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold text-amber-50 sm:text-6xl">
              {title.displayName}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">{title.detailLore}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Signal label="Holder" value={holderLabel(title)} />
              <Signal label={tributeLabel(title.tributeKind)} value={formatDailyTribute(title).split(": ")[1]} />
              {title.lastTributeTxHash ? (
                <Signal
                  label="Last tribute"
                  value={`${(title.lastTributeAmountWolo ?? title.dailyWolo).toLocaleString()} WOLO paid`}
                />
              ) : null}
              {title.currentRecord ? <Signal label="Current Record" value={title.currentRecord} /> : null}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={challengeHref(title)}
                className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Challenge
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/bets"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Open Bets
              </Link>
            </div>
          </div>

          <div className="relative mx-auto aspect-[1.75/1] w-full max-w-[38rem] overflow-visible">
            <Image
              src={title.assetUrl}
              alt=""
              fill
              priority
              unoptimized
              sizes="(min-width: 1024px) 44vw, 92vw"
              className="object-contain drop-shadow-[0_24px_55px_rgba(0,0,0,0.62)]"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.52fr)]">
        <div className="space-y-5">
          <Panel icon={Shield} eyebrow="Rule" title="How it is taken">
            <p className="text-sm leading-6 text-slate-300">{title.rule}</p>
            <p className="mt-3 text-sm leading-6 text-slate-400">{title.eligibility}</p>
          </Panel>

          <Panel icon={Trophy} eyebrow="Contenders" title="Top 10">
            <div className="grid gap-2">
              {Array.from({ length: 10 }, (_, index) => title.contenders[index] ?? null).map((row, index) =>
                row ? (
                  <ContenderRow key={`${row.rank}-${row.name}`} row={row} />
                ) : (
                  <OpenContenderSlot key={`open-${index + 1}`} rank={index + 1} />
                )
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel icon={Medal} eyebrow="Payout Language" title={tributeLabel(title.tributeKind)}>
            <div className="text-3xl font-semibold text-amber-50">
              {title.dailyWolo} WOLO/day{title.type === "tag_team" ? " each" : ""}
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Belts, national titles, ELO ladders, and tag titles pay a Reward Tribute. Special designations pay an Artifact Bonus.
            </p>
          </Panel>

          {title.lastTributeTxHash ? (
            <Panel icon={History} eyebrow="Mainnet Proof" title="Last tribute paid">
              <div className="text-2xl font-semibold text-emerald-100">
                {(title.lastTributeAmountWolo ?? title.dailyWolo).toLocaleString()} WOLO
                {title.lastTributeRecipient ? ` → ${title.lastTributeRecipient}` : ""}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Paid {formatShortDate(title.lastTributePaidAt) || "on-chain"} through the AoE2WAR Founder Rewards settlement rail.
                {title.nextTributeDay ? ` Next scheduled UTC tribute day: ${title.nextTributeDay}.` : ""}
              </p>
              <Link
                href={txProofHref(title.lastTributeTxHash)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-400/15"
              >
                View tx {shortTxHash(title.lastTributeTxHash)}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Panel>
          ) : null}

          <Panel icon={History} eyebrow="History" title="Reign ledger">
            <p className="text-sm leading-6 text-slate-300">{title.historyPlaceholder}</p>
          </Panel>

          <Panel icon={Sparkles} eyebrow="Future Hook" title="Parser transfer rail">
            <p className="text-sm leading-6 text-slate-400">
              Watcher/parser automation can call the title evaluation hooks after verified results without changing this route structure.
            </p>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function ContenderRow({ row }: { row: TitleContender }) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-3 py-3">
      <div className="font-mono text-sm text-amber-100">#{row.rank}</div>
      <div className="min-w-0">
        {row.href ? (
          <Link href={row.href} className="block truncate font-semibold text-white hover:text-amber-100">
            {row.name}
          </Link>
        ) : (
          <div className="truncate font-semibold text-white">{row.name}</div>
        )}
        <div className="truncate text-xs text-slate-500">{row.meta || row.ratingLabel || "Verified contender"}</div>
      </div>
      {row.badge ? (
        <span className="rounded-full border border-amber-200/10 bg-amber-300/5 px-2.5 py-1 text-xs text-amber-100/62">
          {row.badge}
        </span>
      ) : (
        <span className="text-sm text-slate-400">{row.rating ?? ""}</span>
      )}
    </div>
  );
}

function OpenContenderSlot({ rank }: { rank: number }) {
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-3 py-3">
      <div className="font-mono text-sm text-slate-500">#{rank}</div>
      <div className="min-w-0">
        <div className="truncate font-semibold text-slate-300">Open lane</div>
        <div className="truncate text-xs text-slate-600">Win proof to enter</div>
      </div>
      <span className="rounded-full border border-amber-200/10 bg-amber-300/[0.04] px-2.5 py-1 text-xs text-amber-100/55">
        Claimable
      </span>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Panel({
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  icon: typeof Shield;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.24))] p-5 sm:p-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
        <Icon className="h-4 w-4" />
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
