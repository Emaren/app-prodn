"use client";

import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Anvil,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  Database,
  Flame,
  Hammer,
  Layers3,
  Radio,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import WorkshopAsk from "@/components/workshop/WorkshopAsk";
import WorkshopChronicle from "@/components/workshop/WorkshopChronicle";
import WorkshopSponsor from "@/components/workshop/WorkshopSponsor";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";
import type { PublicWorkshop } from "@/lib/workshop";

export type WorkshopDiagnostics = {
  generatedAt: string;
  watcherVersion: string;
  watcherReleasedOn: string;
  corpus: {
    finalReplayRecords: number;
    publicBattleRecords: number;
    uniqueLogicalBattles: number;
    duplicateBattleRecords: number;
    logicalResultResolved: number;
    logicalResultUnresolved: number;
    logicalRosterComplete: number;
    logicalRosterIncomplete: number;
    logicalBattleTruthComplete: number;
    logicalBattleTruthIncomplete: number;
    logicalNeedsResultOnly: number;
    logicalNeedsRosterOnly: number;
    logicalNeedsBoth: number;
    logicalResultCoverageBps: number;
    logicalRosterCoverageBps: number;
    logicalBattleTruthCoverageBps: number;
    excludedFinalRecords: number;
    resolvedResults: number;
    unresolvedResults: number;
    resultCoverageBps: number;
    resolvedTeams: number;
    teamCoverageBps: number;
    reviewRequired: number;
    archivedArtifacts: number;
    archivedBytes: number;
    parseableAtAnyLevelArtifacts: number;
    physicalArchiveAvailable: boolean;
    physicalArchiveObjects: number | null;
    physicalArchiveBytes: number | null;
    physicalRecordedObjects: number | null;
    physicalSavedCheckpointObjects: number | null;
    recoveryQueueArtifacts: number;
    confirmedIrrecoverableArtifacts: number;
    replayBackedSteamAccounts: number;
    provisionalWarriors: number;
    steamAccountsWithMultipleNames: number;
    nameOnlyIdentityBuckets: number;
    profileOnlyPlatformAccounts: number;
    observedDisplayNames: number;
    namesUsedByMultipleSteamAccounts: number;
    proposedPlatformLinks: number;
    activePlatformLinks: number;
    proposedWarriorClaims: number;
    activeWarriorClaims: number;
    identityPublications: number;
  };
  parser: {
    totalRuns: number;
    observations: number;
    totalActions: number;
    frontier: {
      artifacts: number;
      completed: number;
      failed: number;
      recordedGameCandidates: number;
      savedSnapshots: number;
      effectiveResultCorrections: number;
    };
  };
};

type Entry = PublicWorkshop["entries"][number];
type ChroniclePage = {
  entries: PublicWorkshop["entries"];
  hasMore: boolean;
  nextCursor: { id: number } | null;
};

type Props = {
  data: PublicWorkshop;
  chronicle: ChroniclePage;
  diagnostics: WorkshopDiagnostics;
};

type ViewProps = Props & {
  feed: Entry[];
  viewMode: TileViewMode;
  setViewMode: (mode: TileViewMode) => void;
};

const VIEW_LABELS: Record<TileViewMode, string> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

const TYPE_LABELS: Record<string, string> = {
  build_note: "Build Note",
  ai_discussion: "AI Discussion",
  design_decision: "Design Decision",
  screenshot: "Screenshot",
  image: "Image",
  deployment: "Deployment",
  parser_discovery: "Parser Discovery",
  video: "Video",
  livestream: "Livestream",
  audio: "Audio",
  milestone: "Milestone",
};

const LANES = [
  { key: "on_anvil", title: "On the Anvil", note: "Being built now", icon: Anvil },
  { key: "next_forge", title: "Next into the Forge", note: "Published next moves", icon: Wrench },
  { key: "fresh_forge", title: "Fresh from the Forge", note: "Recently completed", icon: Flame },
  { key: "legendary", title: "Legendary Builds", note: "Major milestones", icon: Sparkles },
] as const;

const WORKSHOP_HERO_IMAGE =
  "/workshop/workshop-observatory-hero.webp";

const WORKSHOP_CURRENT_CAMPAIGN =
  "AOE2WAR_WORKSHOP_TRUTH_IN_PRODUCTION_20260808";

function pct(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function bytes(value: number | null) {
  if (value === null) return "Unavailable";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(value / 1024).toLocaleString()} KB`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(data: PublicWorkshop) {
  if (!data.status.isOpen) return "WORKSHOP RESTS";
  if (data.stream || data.status.activityMode === "streaming") return "LIVE BUILD STREAM";
  if (data.status.activityMode === "building_live") return "LIVE CONSTRUCTION";
  if (data.status.activityMode === "major_deployment") return "MAJOR DEPLOYMENT";
  return "THE WORKSHOP IS OPEN";
}

export default function WorkshopExperience({ data, chronicle, diagnostics }: Props) {
  const { viewMode, setViewMode } = useTileViewPreference("workshop");
  const feed = data.entries
    .filter((entry) => entry.lane === "work_feed" || entry.pinned)
    .slice(0, viewMode === "extreme" ? 12 : 8);

  const shared: ViewProps = {
    data,
    chronicle,
    diagnostics,
    feed,
    viewMode,
    setViewMode,
  };

  return (
    <main
      className={
        viewMode === "basic"
          ? "space-y-7 py-7 text-white"
          : "w-full max-w-none space-y-6 py-6 text-white"
      }
      data-workshop-view={viewMode}
      data-workshop-campaign={WORKSHOP_CURRENT_CAMPAIGN}
    >
      {viewMode === "basic" ? (
        <BasicView {...shared} />
      ) : viewMode === "advanced" ? (
        <AdvancedView {...shared} />
      ) : (
        <ExtremeView {...shared} />
      )}
    </main>
  );
}

function ViewToggle({ viewMode, setViewMode }: Pick<ViewProps, "viewMode" | "setViewMode">) {
  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center rounded-full border border-amber-200/20 bg-[#050910]/90 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      role="group"
      aria-label="Workshop view"
    >
      {TILE_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setViewMode(mode)}
          aria-pressed={viewMode === mode}
          aria-label={`${VIEW_LABELS[mode]} Workshop view`}
          title={`${VIEW_LABELS[mode]} view`}
          className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            viewMode === mode
              ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
              : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
          }`}
        >
          {mode[0]}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ data }: { data: PublicWorkshop }) {
  const live = Boolean(data.stream || data.status.isLive);
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-amber-100/16 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-50">
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          live
            ? "animate-pulse bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.8)]"
            : data.status.isOpen
              ? "bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.6)]"
              : "bg-slate-500"
        }`}
      />
      {statusLabel(data)}
    </div>
  );
}

function CurrentFront({ data }: { data: PublicWorkshop }) {
  return data.status.currentProject ? (
    <div className="mt-5 inline-flex rounded-full border border-cyan-100/12 bg-cyan-300/[0.05] px-4 py-2 text-xs text-cyan-50/80">
      Current front · {data.status.currentProject}
    </div>
  ) : null;
}

function WorkshopHeroBanner({
  tone,
}: {
  tone: "basic" | "advanced";
}) {
  return (
    <div
      className={`workshop-hero-banner workshop-hero-banner--${tone}`}
      role="img"
      aria-label="A vast medieval observatory and living Workshop filled with maps, builders, golden machinery, and blue constellation instruments"
    >
      <Image
        src={WORKSHOP_HERO_IMAGE}
        alt=""
        fill
        priority
        className="object-cover object-center"
        sizes="(max-width: 1024px) 100vw, 1200px"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(2,6,23,0.14)_48%,rgba(2,6,23,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.10),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(56,189,248,0.12),transparent_30%)]" />
      <div className="pointer-events-none absolute inset-x-[8%] bottom-0 h-px bg-gradient-to-r from-transparent via-amber-100/32 to-transparent" />
    </div>
  );
}

function BasicView(props: ViewProps) {
  const { data, chronicle, diagnostics, feed, viewMode, setViewMode } = props;
  return (
    <>
      <section
        className="workshop-basic-market-hero relative isolate min-h-[42rem] overflow-hidden rounded-[2.35rem] border border-amber-100/16 bg-[#03060c] shadow-[0_40px_125px_rgba(0,0,0,0.48)] sm:min-h-[45rem]"
        data-workshop-basic-market-hero="market"
      >
        <WorkshopHeroBanner tone="basic" />

        <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(2,5,13,0.88)_0%,rgba(2,5,13,0.73)_30%,rgba(2,5,13,0.34)_60%,rgba(2,5,13,0.10)_100%),linear-gradient(180deg,rgba(2,5,13,0.08),rgba(2,5,13,0.18)_55%,rgba(2,5,13,0.96)_100%)]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 z-20 h-px bg-gradient-to-r from-transparent via-amber-100/55 to-transparent" />

        <div
          className="absolute right-5 top-5 z-40"
          onClick={(event) => event.stopPropagation()}
        >
          <ViewToggle
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>

        <div className="relative z-20 flex min-h-[42rem] max-w-[55rem] flex-col px-6 pb-36 pt-8 sm:min-h-[45rem] sm:px-10 sm:pb-36 sm:pt-11 lg:px-14">
          <div>
            <div className="flex max-w-[calc(100%-8rem)] flex-wrap gap-2">
              <StatusPill data={data} />

              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-100/18 bg-black/38 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-50 backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5" />
                Living history
              </span>

              <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/18 bg-black/38 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-50 backdrop-blur-md">
                <ShieldCheck className="h-3.5 w-3.5" />
                Public observatory
              </span>
            </div>

            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.42em] text-slate-400">
              AoE2WAR · The Workshop
            </p>
          </div>
        </div>

        <div className="workshop-basic-market-title absolute left-6 top-[31%] z-20 max-w-[40rem] sm:left-10 lg:left-14">
          <h1 className="market-display-title market-display-gold market-hero-title pb-2 font-serif text-5xl font-normal leading-[1.01] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            The Workshop
          </h1>

          <div className="mt-3 h-px w-36 bg-gradient-to-r from-amber-100/62 via-amber-100/20 to-transparent" />

          <p className="mt-5 max-w-[31rem] font-serif text-2xl leading-tight text-slate-100 drop-shadow-[0_3px_18px_rgba(0,0,0,0.85)] sm:text-3xl">
            The strange machine is forged in public.
          </p>

          <p className="mt-3 max-w-[34rem] text-sm leading-6 text-slate-300 sm:text-[15px]">
            Follow what changed, what the evidence proves, and what the Kingdom is building next.
          </p>
        </div>

        <div className="absolute bottom-6 left-6 right-6 z-30 max-w-[38rem] sm:left-10 sm:right-auto lg:left-14">
          {data.status.currentProject ? (
            <div className="mb-3 inline-flex max-w-full rounded-full border border-cyan-100/16 bg-black/55 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-50/82 backdrop-blur-lg">
              <span className="truncate">
                Current front · {data.status.currentProject}
              </span>
            </div>
          ) : null}

          <div className="mb-4 flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/18 bg-black/55 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-50 backdrop-blur-lg">
              <Hammer className="h-4 w-4" />
              Build culture made visible
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="#workbench"
              className="market-gold-button group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-black sm:min-h-14 sm:min-w-[13.5rem] sm:px-8 sm:text-base"
            >
              Enter the Forge
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>

            <Link
              href="/radio"
              className="market-iron-button inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold sm:min-h-14 sm:min-w-[13.5rem] sm:px-8 sm:text-base"
            >
              Workshop Radio
              <Radio className="h-4 w-4 text-amber-100" />
            </Link>
          </div>
        </div>

        <div className="absolute bottom-6 right-6 z-30 hidden w-[27rem] grid-cols-3 gap-2 lg:grid">
          {[
            ["B", "Classic Chronicle"],
            [pct(diagnostics.corpus.resultCoverageBps), "Result coverage"],
            [`v${diagnostics.watcherVersion}`, "Watcher live"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="rounded-[1rem] border border-white/10 bg-slate-950/64 px-4 py-3 backdrop-blur-xl"
            >
              <div className="market-display-title market-display-gold font-serif text-lg font-semibold">
                {value}
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-cyan-100/12 bg-[linear-gradient(145deg,#061521,#080b12_58%,#120a05)] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Current campaign</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl sm:text-5xl">Truth in Production.</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Replay-result recovery, authenticated Watcher exits, completed-day
              observability, and Watcher-grounded statistics are now live behind
              explicit authority boundaries and production proof.
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold text-cyan-100">{pct(diagnostics.corpus.logicalBattleTruthCoverageBps)}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">Full battle truth</div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Full battle truth" value={diagnostics.corpus.logicalBattleTruthComplete} />
          <Metric label="Needs truth" value={diagnostics.corpus.logicalBattleTruthIncomplete} alert />
          <Metric label="Logical battles" value={diagnostics.corpus.uniqueLogicalBattles} />
          <Metric label="Complete rosters" value={diagnostics.corpus.logicalRosterComplete} />
        </div>
        <Progress value={diagnostics.corpus.logicalBattleTruthCoverageBps / 100} />
        <Boundary compact />
      </section>

      <LiveStream data={data} />
      <WorkshopSponsor />
      <WorkshopChronicle initialEntries={chronicle.entries} initialHasMore={chronicle.hasMore} initialNextCursor={chronicle.nextCursor} />
      <Workbench data={data} concise={false} />
      <Feed entries={feed} concise={false} columns="lg:grid-cols-2" />
      <WorkshopAsk />
      <Publication />
    </>
  );
}

function AdvancedView(props: ViewProps) {
  const { data, chronicle, diagnostics, feed, viewMode, setViewMode } = props;
  const fullTruth = diagnostics.corpus.logicalBattleTruthCoverageBps / 100;
  const result = diagnostics.corpus.logicalResultCoverageBps / 100;
  const roster = diagnostics.corpus.logicalRosterCoverageBps / 100;
  const frontier = diagnostics.parser.frontier.artifacts
    ? (diagnostics.parser.frontier.completed / diagnostics.parser.frontier.artifacts) * 100
    : 0;

  return (
    <>
      <section className="relative overflow-hidden rounded-[2.35rem] border border-cyan-100/13 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.14),transparent_28%),linear-gradient(145deg,#061521,#060912_57%,#120a05)] p-6 shadow-[0_32px_110px_rgba(0,0,0,0.38)] sm:p-9 lg:p-10">
        <WorkshopHeroBanner tone="advanced" />
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <StatusPill data={data} />
            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.38em] text-cyan-100/55">The Workshop · Advanced</div>
            <h1 className="mt-3 font-serif text-5xl leading-[0.94] sm:text-7xl">Truth in Production.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              What happened. What proved it. Which authority accepted it. What remains deliberately uncertain.
            </p>
            <CurrentFront data={data} />
          </div>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Full battle truth" value={pct(diagnostics.corpus.logicalBattleTruthCoverageBps)} accent />
          <Metric label="Full truth" value={diagnostics.corpus.logicalBattleTruthComplete} />
          <Metric label="Needs truth" value={diagnostics.corpus.logicalBattleTruthIncomplete} alert />
          <Metric label="Complete rosters" value={diagnostics.corpus.logicalRosterComplete} />
          <Metric label="Logical battles" value={diagnostics.corpus.uniqueLogicalBattles} />
          <Metric label="Watcher" value={`v${diagnostics.watcherVersion}`} accent />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.28fr_0.72fr]">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/78 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Replay truth progress</Eyebrow>
              <h2 className="mt-2 text-3xl font-semibold">
                {diagnostics.corpus.logicalBattleTruthComplete.toLocaleString()} of {diagnostics.corpus.uniqueLogicalBattles.toLocaleString()} logical battles have full truth
              </h2>
            </div>
            <div className="text-3xl font-semibold text-cyan-100">{fullTruth.toFixed(1)}%</div>
          </div>
          <Progress value={fullTruth} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Mini label="Result truth" value={`${result.toFixed(1)}% · ${diagnostics.corpus.logicalResultResolved.toLocaleString()}`} />
            <Mini label="Roster truth" value={`${roster.toFixed(1)}% · ${diagnostics.corpus.logicalRosterComplete.toLocaleString()}`} />
            <Mini label="Need both" value={diagnostics.corpus.logicalNeedsBoth.toLocaleString()} />
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-400">
            Full truth requires both a defensible winner and complete public participant/team composition. Unknown results stay unknown; roster recovery never manufactures result authority.
          </p>
        </div>
        <div className="rounded-[2rem] border border-amber-200/14 bg-[linear-gradient(145deg,rgba(50,34,16,0.74),rgba(4,8,16,0.94))] p-6 sm:p-8">
          <Eyebrow tone="amber">Production state</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold">The machine at a glance</h2>
          <div className="mt-5 space-y-3">
            <StatusLine label="Archive frontier" value={`${frontier.toFixed(1)}% accounted`} good />
            <StatusLine label="Replay results" value={`${result.toFixed(1)}% resolved`} />
            <StatusLine label="Identity links" value="Proposed, not merged" guarded />
            <StatusLine label="Bet + settlement" value="Separate authority" guarded />
            <StatusLine label="Watcher transport" value={`v${diagnostics.watcherVersion} live`} good />
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-cyan-100/12 bg-[linear-gradient(145deg,rgba(5,18,30,0.94),rgba(3,7,14,0.94))] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>How the machine moves</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold">Five gates. No magic leaps.</h2>
          </div>
          <Link href="/game-stats" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 hover:text-white">
            Replay Operations <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <Gate number="01" title="Archive" note="Preserve source bytes." done />
          <Gate number="02" title="Decode" note="Recover evidence." done />
          <Gate number="03" title="Review" note="Keep doubt visible." active />
          <Gate number="04" title="Publish" note="Accept public truth." guarded />
          <Gate number="05" title="Settle" note="Cross the money gate." guarded />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Front icon={Target} label="Replay truth" title={`${diagnostics.corpus.logicalResultUnresolved.toLocaleString()} logical battles still need a result`} note="Resolve outcome evidence without manufacturing certainty." href="/game-stats" />
        <Front icon={Users} label="Identity" title={`${diagnostics.corpus.replayBackedSteamAccounts.toLocaleString()} replay-backed accounts`} note="Aliases can fold into accounts. Accounts do not silently become one human." href="/leaderboard" />
        <Front icon={ShieldCheck} label="Reliability" title={`${diagnostics.corpus.logicalBattleTruthIncomplete.toLocaleString()} logical battles still need truth`} note={`${diagnostics.corpus.logicalNeedsResultOnly.toLocaleString()} need only a result, ${diagnostics.corpus.logicalNeedsRosterOnly.toLocaleString()} need only roster truth, and ${diagnostics.corpus.logicalNeedsBoth.toLocaleString()} need both.`} href="/game-stats" />
        <Front icon={Activity} label="Watcher" title={`Version ${diagnostics.watcherVersion} is live`} note="Immutable snapshots keep one captured replay from changing mid-flight." href="/download" />
      </section>

      <LiveStream data={data} />
      <Workbench data={data} concise />
      <Feed entries={feed} concise columns="lg:grid-cols-2" />
      <WorkshopSponsor />
      <WorkshopChronicle initialEntries={chronicle.entries} initialHasMore={chronicle.hasMore} initialNextCursor={chronicle.nextCursor} />
      <WorkshopAsk />
      <Boundary />
      <Publication />
    </>
  );
}

function ExtremeView(props: ViewProps) {
  const { data, chronicle, diagnostics, feed, viewMode, setViewMode } = props;
  const [heroBackgroundVisible, setHeroBackgroundVisible] = useState(false);
  const fullTruth = diagnostics.corpus.logicalBattleTruthCoverageBps / 100;
  const result = diagnostics.corpus.logicalResultCoverageBps / 100;
  const team = diagnostics.corpus.logicalRosterCoverageBps / 100;
  const decoded = diagnostics.corpus.archivedArtifacts
    ? (diagnostics.corpus.parseableAtAnyLevelArtifacts / diagnostics.corpus.archivedArtifacts) * 100
    : 0;
  const frontier = diagnostics.parser.frontier.artifacts
    ? (diagnostics.parser.frontier.completed / diagnostics.parser.frontier.artifacts) * 100
    : 0;

  return (
    <>
      <section
        className="relative cursor-pointer overflow-hidden rounded-[2.65rem] border border-white/10 bg-[#020711] p-6 shadow-[0_42px_140px_rgba(0,0,0,0.62)] transition-[border-color,box-shadow] duration-500 sm:p-9 lg:p-11"
        data-workshop-extreme-hero={
          heroBackgroundVisible ? "on" : "off"
        }
        onClick={() =>
          setHeroBackgroundVisible((current) => !current)
        }
        title={
          heroBackgroundVisible
            ? "Click to restore the clean Extreme Observatory background"
            : "Click to reveal the Workshop mural"
        }
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:42px_42px] [mask-image:linear-gradient(to_bottom,black,transparent_82%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-5xl">
            <StatusPill data={data} />
            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.42em] text-cyan-100/55">The Workshop · Extreme Observatory</div>
            <h1 className="mt-3 max-w-5xl font-serif text-5xl leading-[0.9] sm:text-7xl lg:text-8xl">The war machine, exposed.</h1>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Archive, parser, battle truth, identity, publication, and settlement—one understandable system without pretending they are one authority.
            </p>
            <CurrentFront data={data} />
          </div>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        <div className="relative mt-9 grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
          <Dial value={fullTruth} resolved={diagnostics.corpus.logicalBattleTruthComplete} unresolved={diagnostics.corpus.logicalBattleTruthIncomplete} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Final records" value={diagnostics.corpus.finalReplayRecords} />
            <Metric label="Public battle records" value={diagnostics.corpus.publicBattleRecords} />
            <Metric label="Logical battles" value={diagnostics.corpus.uniqueLogicalBattles} />
            <Metric label="Review queue" value={diagnostics.corpus.reviewRequired} alert />
            <Metric label="Parser runs" value={compact(diagnostics.parser.totalRuns)} />
            <Metric label="Watcher" value={`v${diagnostics.watcherVersion}`} accent />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2.1rem] border border-cyan-100/12 bg-[#050b14]/95 p-6 sm:p-8">
          <Eyebrow>Truth funnel</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold">Every number has a grain.</h2>
          <div className="mt-6 space-y-3">
            <Funnel label="Final ingestion records" value={diagnostics.corpus.finalReplayRecords} max={diagnostics.corpus.finalReplayRecords} />
            <Funnel label="Public battle records" value={diagnostics.corpus.publicBattleRecords} max={diagnostics.corpus.finalReplayRecords} />
            <Funnel label="Unique logical battles" value={diagnostics.corpus.uniqueLogicalBattles} max={diagnostics.corpus.finalReplayRecords} />
            <Funnel label="Complete rosters" value={diagnostics.corpus.logicalRosterComplete} max={diagnostics.corpus.uniqueLogicalBattles} />
            <Funnel label="Full battle truth" value={diagnostics.corpus.logicalBattleTruthComplete} max={diagnostics.corpus.uniqueLogicalBattles} accent />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Mini label="Duplicate / rehost rows" value={diagnostics.corpus.duplicateBattleRecords.toLocaleString()} />
            <Mini label="Excluded non-battle rows" value={diagnostics.corpus.excludedFinalRecords.toLocaleString()} />
          </div>
        </div>
        <div className="rounded-[2.1rem] border border-violet-100/12 bg-[linear-gradient(145deg,rgba(33,18,61,0.58),rgba(3,7,14,0.96))] p-6 sm:p-8">
          <Eyebrow tone="violet">Confidence radar</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold">Where the machine is strong.</h2>
          <div className="mt-6 space-y-5">
            <Radar label="Archive frontier" value={frontier} />
            <Radar label="Artifacts decoded" value={decoded} />
            <Radar label="Result truth" value={result} />
            <Radar label="Roster + team truth" value={team} />
            <Radar label="Full battle truth" value={fullTruth} />
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <Diagnostic icon={Database} title="Archive" tone="emerald" metrics={[
          ["Physical objects", diagnostics.corpus.physicalArchiveObjects?.toLocaleString() ?? "Unavailable"],
          ["Physical source bytes", bytes(diagnostics.corpus.physicalArchiveBytes)],
          ["Indexed artifacts", diagnostics.corpus.archivedArtifacts.toLocaleString()],
          ["Recovery queue", diagnostics.corpus.recoveryQueueArtifacts.toLocaleString()],
        ]} />
        <Diagnostic icon={Layers3} title="Parser" tone="cyan" metrics={[
          ["Latest dispositions", `${diagnostics.parser.frontier.completed.toLocaleString()} / ${diagnostics.parser.frontier.artifacts.toLocaleString()}`],
          ["Current failures", diagnostics.parser.frontier.failed.toLocaleString()],
          ["Observations", compact(diagnostics.parser.observations)],
          ["Action packets", compact(diagnostics.parser.totalActions)],
        ]} />
        <Diagnostic icon={Users} title="Identity" tone="amber" metrics={[
          ["Replay-backed accounts", diagnostics.corpus.replayBackedSteamAccounts.toLocaleString()],
          ["Provisional Warriors", diagnostics.corpus.provisionalWarriors.toLocaleString()],
          ["Proposed links", diagnostics.corpus.proposedPlatformLinks.toLocaleString()],
          ["Active links", diagnostics.corpus.activePlatformLinks.toLocaleString()],
        ]} />
      </section>

      <section className="rounded-[2.1rem] border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.12),transparent_38%),#050910] p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow tone="amber">Authority map</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold">Evidence can travel. Authority cannot teleport.</h2>
          </div>
          <ShieldCheck className="h-7 w-7 text-amber-200" />
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-5">
          <Gate number="01" title="Source" note="Immutable bytes" done />
          <Gate number="02" title="Candidate" note="Parser evidence" done />
          <Gate number="03" title="Accepted" note="Human/adjudicated truth" active />
          <Gate number="04" title="Public" note="Visible projection" guarded />
          <Gate number="05" title="Financial" note="Separate settlement" guarded />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Signal label="Recorded-game candidates" value={diagnostics.parser.frontier.recordedGameCandidates} />
        <Signal label="Saved checkpoints" value={diagnostics.parser.frontier.savedSnapshots} />
        <Signal label="Strict corrections" value={diagnostics.parser.frontier.effectiveResultCorrections} />
        <Signal label="Confirmed irrecoverable" value={diagnostics.corpus.confirmedIrrecoverableArtifacts} />
      </section>

      <LiveStream data={data} />
      <Workbench data={data} concise />
      <Feed entries={feed} concise columns="xl:grid-cols-3" />
      <WorkshopSponsor />
      <WorkshopChronicle initialEntries={chronicle.entries} initialHasMore={chronicle.hasMore} initialNextCursor={chronicle.nextCursor} />
      <WorkshopAsk />
      <Boundary />
      <Publication />
    </>
  );
}

function Eyebrow({ children, tone = "cyan" }: { children: ReactNode; tone?: "cyan" | "amber" | "violet" | "orange" }) {
  const color = tone === "amber" ? "text-amber-100/60" : tone === "violet" ? "text-violet-100/60" : tone === "orange" ? "text-orange-100/60" : "text-cyan-100/60";
  return <div className={`text-[10px] font-bold uppercase tracking-[0.3em] ${color}`}>{children}</div>;
}

function Metric({ label, value, alert = false, accent = false }: { label: string; value: string | number; alert?: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-[1.35rem] border p-4 ${alert ? "border-amber-200/16 bg-amber-300/[0.055]" : "border-white/9 bg-black/20"}`}>
      <div className={`text-2xl font-semibold ${alert ? "text-amber-100" : accent ? "text-cyan-100" : "text-white"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.035] p-4"><div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{label}</div><div className="mt-2 font-semibold text-white">{value}</div></div>;
}

function Progress({ value }: { value: number }) {
  return <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-300 to-amber-300" style={{ width: `${clamp(value)}%` }} /></div>;
}

function StatusLine({ label, value, good = false, guarded = false }: { label: string; value: string; good?: boolean; guarded?: boolean }) {
  return <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3 last:border-0"><span className="text-sm text-slate-300">{label}</span><span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${good ? "text-emerald-200" : guarded ? "text-amber-200" : "text-cyan-200"}`}>{value}</span></div>;
}

function Gate({ number, title, note, done = false, active = false, guarded = false }: { number: string; title: string; note: string; done?: boolean; active?: boolean; guarded?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${active ? "border-cyan-200/18 bg-cyan-300/[0.06]" : guarded ? "border-amber-200/13 bg-amber-300/[0.04]" : "border-emerald-200/12 bg-emerald-300/[0.04]"}`}><div className="flex items-center justify-between"><span className="text-[9px] font-bold tracking-[0.2em] text-slate-500">{number}</span>{done ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : <CircleDashed className={`h-4 w-4 ${active ? "text-cyan-200" : "text-amber-200"}`} />}</div><div className="mt-4 font-semibold text-white">{title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{note}</div></div>;
}

function Front({ icon: Icon, label, title, note, href }: { icon: LucideIcon; label: string; title: string; note: string; href: string }) {
  return <Link href={href} className="group rounded-[1.8rem] border border-white/9 bg-slate-950/74 p-6 transition hover:border-cyan-100/18 hover:bg-white/[0.045]"><div className="flex items-center justify-between"><Icon className="h-5 w-5 text-cyan-100" /><ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-100" /></div><Eyebrow>{label}</Eyebrow><h3 className="mt-3 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-400">{note}</p></Link>;
}

function Dial({ value, resolved, unresolved }: { value: number; resolved: number; unresolved: number }) {
  return <div className="rounded-[2rem] border border-cyan-100/12 bg-black/30 p-6"><div className="mx-auto flex aspect-square max-w-[18rem] items-center justify-center rounded-full p-5" style={{ background: `conic-gradient(rgb(103 232 249) ${clamp(value)}%, rgba(255,255,255,0.06) 0)` }}><div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#050a12]"><div className="text-5xl font-semibold text-white">{value.toFixed(1)}%</div><div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-cyan-100/55">Result coverage</div></div></div><div className="mt-5 grid grid-cols-2 gap-3"><Mini label="Resolved" value={resolved.toLocaleString()} /><Mini label="Unresolved" value={unresolved.toLocaleString()} /></div></div>;
}

function Funnel({ label, value, max, accent = false }: { label: string; value: number; max: number; accent?: boolean }) {
  const width = max ? (value / max) * 100 : 0;
  return <div><div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-300">{label}</span><span className={accent ? "font-semibold text-cyan-100" : "font-semibold text-white"}>{value.toLocaleString()}</span></div><div className="mt-2 h-8 overflow-hidden rounded-xl border border-white/8 bg-white/[0.025]"><div className={`h-full ${accent ? "bg-gradient-to-r from-cyan-500/65 to-emerald-300/55" : "bg-white/[0.08]"}`} style={{ width: `${clamp(width)}%` }} /></div></div>;
}

function Radar({ label, value }: { label: string; value: number }) {
  return <div><div className="flex items-center justify-between text-sm"><span className="text-slate-300">{label}</span><span className="font-semibold text-white">{value.toFixed(1)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-300" style={{ width: `${clamp(value)}%` }} /></div></div>;
}

function Diagnostic({ icon: Icon, title, tone, metrics }: { icon: LucideIcon; title: string; tone: "emerald" | "cyan" | "amber"; metrics: Array<[string, string]> }) {
  const color = tone === "emerald" ? "text-emerald-100" : tone === "amber" ? "text-amber-100" : "text-cyan-100";
  return <section className="rounded-[2rem] border border-white/9 bg-slate-950/78 p-6"><div className={`flex items-center gap-3 ${color}`}><Icon className="h-5 w-5" /><div className="text-xs font-bold uppercase tracking-[0.26em]">{title}</div></div><div className="mt-5 space-y-3">{metrics.map(([label, value]) => <StatusLine key={label} label={label} value={value} />)}</div></section>;
}

function Signal({ label, value }: { label: string; value: number }) {
  return <div className="rounded-[1.6rem] border border-white/9 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-5"><Activity className="h-4 w-4 text-cyan-100" /><div className="mt-4 text-3xl font-semibold text-white">{value.toLocaleString()}</div><div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div></div>;
}

function Workbench({ data, concise }: { data: PublicWorkshop; concise: boolean }) {
  return <section id="workbench" className="grid gap-5 md:grid-cols-2">{LANES.map(({ key, title, note, icon: Icon }) => { const entries = data.entries.filter((entry) => entry.lane === key).slice(0, concise ? 5 : 8); return <section key={key} className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-6"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/9 bg-white/[0.035] text-amber-100"><Icon className="h-5 w-5" /></div><div><div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/76">{title}</div><div className="mt-1 text-xs text-slate-500">{note}</div></div></div><span className="rounded-full border border-white/8 px-3 py-1 text-xs text-slate-300">{entries.length}</span></div><div className="mt-5 space-y-3">{entries.length ? entries.map((entry) => <Project key={entry.publicId} entry={entry} concise={concise} />) : <div className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-500">Nothing deliberately published here.</div>}</div></section>; })}</section>;
}

function Project({ entry, concise }: { entry: Entry; concise: boolean }) {
  return <article className="rounded-2xl border border-white/8 bg-white/[0.028] p-4"><div className="text-[9px] font-bold uppercase tracking-[0.22em] text-cyan-100/52">{TYPE_LABELS[entry.entryType] || entry.entryType}</div><h3 className="mt-2 font-semibold text-white">{entry.title}</h3>{!concise && entry.summary ? <p className="mt-2 text-sm leading-6 text-slate-400">{entry.summary}</p> : null}</article>;
}

function Feed({ entries, concise, columns }: { entries: Entry[]; concise: boolean; columns: string }) {
  return <section className="rounded-[1.95rem] border border-white/10 bg-slate-950/75 p-6 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><Eyebrow tone="orange">Latest movement</Eyebrow><h2 className="mt-2 text-3xl font-semibold">Selected sparks from the forge.</h2></div><div className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-200" /> Deliberately published</div></div><div className={`mt-6 grid gap-4 ${columns}`}>{entries.map((entry) => <EntryCard key={entry.publicId} entry={entry} concise={concise} />)}</div></section>;
}

function EntryCard({ entry, concise }: { entry: Entry; concise: boolean }) {
  return <article id={entry.publicId} className="overflow-hidden rounded-[1.5rem] border border-white/9 bg-white/[0.028]"><div className="p-5"><div className="flex items-center justify-between gap-3"><div className="text-[10px] font-bold uppercase tracking-[0.24em] text-orange-100/58">{TYPE_LABELS[entry.entryType] || entry.entryType}</div><time className="text-[10px] text-slate-600">{formatDate(entry.occurredAt)}</time></div><h3 className="mt-3 text-xl font-semibold">{entry.title}</h3>{entry.summary ? <p className="mt-3 text-sm leading-6 text-slate-300">{entry.summary}</p> : null}{!concise && entry.body ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-400">{entry.body}</p> : null}{entry.mediaUrl ? entry.mediaKind === "video" ? <video className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black object-cover" controls preload="metadata" src={entry.mediaUrl} /> : entry.mediaKind === "audio" ? <audio className="mt-5 w-full" controls preload="none" src={entry.mediaUrl} /> : <Image className="mt-5 max-h-[30rem] w-full rounded-2xl border border-white/10 object-cover" src={entry.mediaUrl} alt={entry.mediaAlt || entry.title} width={1200} height={800} sizes="(max-width: 1024px) 100vw, 50vw" unoptimized /> : null}{entry.linkUrl ? <Link href={entry.linkUrl} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-cyan-100 hover:text-white">{entry.linkLabel || "Open build"} <ArrowRight className="h-4 w-4" /></Link> : null}</div></article>;
}

function LiveStream({ data }: { data: PublicWorkshop }) {
  if (!data.stream) return null;
  return <section className="overflow-hidden rounded-[1.9rem] border border-red-300/20 bg-red-500/[0.06] p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-[0.3em] text-red-100/70">Live from the Workshop</div><h2 className="mt-2 text-3xl font-semibold">{data.stream.title}</h2></div><span className="animate-pulse rounded-full bg-red-400 px-4 py-2 text-xs font-bold text-red-950">LIVE</span></div>{data.stream.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{data.stream.description}</p> : null}{data.stream.playbackUrl ? <video className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black" controls playsInline preload="metadata" poster={data.stream.thumbnailUrl || undefined} src={data.stream.playbackUrl} /> : data.stream.embedUrl ? <iframe className="mt-5 aspect-video w-full rounded-2xl border border-white/10 bg-black" src={data.stream.embedUrl} title={data.stream.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" /> : null}</section>;
}

function Boundary({ compact: isCompact = false }: { compact?: boolean }) {
  return <section className={`rounded-2xl border border-amber-200/12 bg-amber-300/[0.045] px-5 py-4 text-xs leading-6 text-slate-400 ${isCompact ? "mt-5" : ""}`}><span className="font-semibold text-amber-100">Truth boundary:</span>{" "}Parser evidence can improve what AoE2WAR knows. It cannot silently invent a winner, merge human identities, reopen betting, approve money, or settle on-chain state.</section>;
}

function Publication() {
  return <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-[1.8rem] border border-fuchsia-100/12 bg-fuchsia-300/[0.045] p-6"><div className="flex items-center gap-3 text-fuchsia-100"><Bot className="h-5 w-5" /><div className="text-xs font-bold uppercase tracking-[0.28em]">AI in the Workshop</div></div><h2 className="mt-4 text-2xl font-semibold">Selected collaboration can become canon.</h2><p className="mt-3 text-sm leading-6 text-slate-300">Chosen AI build exchanges may be published as curated records. Private chats are never mirrored automatically.</p></div><div className="rounded-[1.8rem] border border-emerald-100/12 bg-emerald-300/[0.045] p-6"><div className="flex items-center gap-3 text-emerald-100"><ShieldCheck className="h-5 w-5" /><div className="text-xs font-bold uppercase tracking-[0.28em]">Publication boundary</div></div><h2 className="mt-4 text-2xl font-semibold">The window is deliberate.</h2><p className="mt-3 text-sm leading-6 text-slate-300">Credentials, private messages, raw prompts, security findings, and financial secrets never appear without a separate sanitized public record.</p></div></section>;
}
