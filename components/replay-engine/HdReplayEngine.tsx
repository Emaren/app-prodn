"use client";

import Link from "next/link";
import {
  Activity, ArrowDownRight, ArrowUpRight, Binary, ChevronDown, ChevronRight,
  Clock3, Cpu, Database, FileQuestion, Gauge, HardDrive, Info, Layers3,
  Radio, RefreshCw, ScanLine, Search, ShieldCheck, Target, Users, Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReplayEngineCase, ReplayEngineSnapshot } from "@/lib/hdReplayEngine";

const REFRESH_MS = 120_000;
const integer = (value: number) => value.toLocaleString("en-US");
const percent = (bps: number) => (bps / 100).toFixed(1) + "%";

function shortDate(value: string | null | undefined) {
  if (!value) return "Unrecorded";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unrecorded";
  return new Intl.DateTimeFormat("en", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  }).format(parsed);
}

function StatusLight({ subdued = false }: { subdued?: boolean }) {
  return <span aria-hidden className={`replay-beacon ${subdued ? "replay-beacon-muted" : ""}`} />;
}

function SectionIndex({ number, title, marker }: {
  number: string; title: string; marker: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="replay-section-number">{number}</span>
        <h2 className="text-lg font-semibold tracking-tight text-stone-100 sm:text-xl">{title}</h2>
      </div>
      <span className="replay-eyebrow text-stone-500">{marker}</span>
    </div>
  );
}

function Meter({ value, max, tone = "copper" }: {
  value: number; max: number; tone?: "copper" | "ice" | "green" | "red";
}) {
  const width = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  return (
    <div className="replay-meter" role="progressbar" aria-valuenow={value}
      aria-valuemin={0} aria-valuemax={max || 1}>
      <span className={`replay-meter-fill replay-meter-${tone}`}
        style={{ width: `${width}%` }} />
    </div>
  );
}

function Stat({ label, value, sub, tone = "neutral" }: {
  label: string; value: string; sub: string; tone?: "neutral" | "copper" | "ice" | "green";
}) {
  return (
    <div className="replay-stat">
      <span className="replay-eyebrow text-stone-500">{label}</span>
      <strong className={`mt-4 block font-mono text-3xl font-semibold tracking-[-0.07em] sm:text-4xl replay-text-${tone}`}>{value}</strong>
      <span className="mt-2 block text-xs text-stone-400">{sub}</span>
    </div>
  );
}

function EngineRing({ value, resolved, total }: {
  value: number; resolved: number; total: number;
}) {
  const pct = Math.max(0, Math.min(100, value / 100));
  return (
    <div className="replay-ring-assembly" aria-label={`Verified results: ${percent(value)}`}>
      <div className="replay-ring-outer">
        <div className="replay-ring-marks" />
        <div className="replay-ring-rotation" />
        <div className="replay-ring-track" style={{
          background: `conic-gradient(#cba978 ${pct}%, rgba(164,173,179,.1) ${pct}% 100%)`,
        }}>
          <div className="replay-ring-center">
            <span className="replay-eyebrow text-stone-400">RESULT TRUTH</span>
            <strong className="mt-1 font-mono text-[clamp(2rem,4vw,3.7rem)] font-semibold leading-none tracking-[-0.085em] text-stone-50">{percent(value)}</strong>
            <span className="mt-2 font-mono text-[11px] text-stone-400">{integer(resolved)} / {integer(total)}</span>
            <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[.18em] text-emerald-200/75">
              <StatusLight subdued /> Evidence bound
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LineDistribution({
  rows, total, limit = 7, tint = "copper", empty = "No breakdown published",
}: {
  rows: Array<{ label: string; count: number }>;
  total?: number;
  limit?: number;
  tint?: "copper" | "ice" | "green" | "red";
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="space-y-3">
      {rows.slice(0, limit).map((row, i) => (
        <div key={row.label + i} className="group" title={row.label}>
          <div className="mb-1.5 flex min-w-0 justify-between gap-4 font-mono text-[11px]">
            <span className="min-w-0 truncate text-stone-300 group-hover:text-white">{row.label}</span>
            <span className="shrink-0 text-stone-400">
              {integer(row.count)}{total ? ` · ${(row.count / total * 100).toFixed(1)}%` : ""}
            </span>
          </div>
          <Meter value={row.count} max={max} tone={tint} />
        </div>
      ))}
      {!rows.length && <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-stone-500">{empty}</div>}
    </div>
  );
}

const GATES = [
  { key: "intake", label: "Intake", detail: "Final source row recorded" },
  { key: "participantsObserved", label: "Players", detail: "At least two player names observed" },
  { key: "sidesVerified", label: "Teams", detail: "Two sides resolved from evidence" },
  { key: "resultVerified", label: "Winner", detail: "Independently defensible result" },
] as const;

function CaseTile({ game, expanded, onToggle }: {
  game: ReplayEngineCase;
  expanded: boolean;
  onToggle: () => void;
}) {
  const done = game.gatesPassed;
  return (
    <article className={`replay-case ${expanded ? "replay-case-open" : ""}`}>
      <button type="button" className="w-full cursor-pointer text-left" onClick={onToggle}
        aria-expanded={expanded} aria-controls={`replay-case-${game.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="replay-case-icon"><Binary size={18} strokeWidth={1.5} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-stone-50">#{game.id}</span>
                <span className="replay-mini-tag">UNKNOWN OUTCOME</span>
              </div>
              <div className="mt-1 truncate text-xs text-stone-400">
                {game.mapName} <span className="px-1 text-stone-600">/</span> {game.owner}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-amber-200/85">{done}/4 gates</span>
            {expanded ? <ChevronDown size={16} className="text-stone-400" /> : <ChevronRight size={16} className="text-stone-400" />}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-1.5" aria-label={`${done} of 4 evidence gates passed`}>
          {GATES.map((gate) => (
            <span key={gate.key} title={gate.detail} className={`replay-evidence-segment ${game.gates[gate.key] ? "replay-evidence-ready" : ""}`} />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[.13em] text-stone-500">
          <span>Evidence checkpoints</span>
          <span>Not a win probability</span>
        </div>
      </button>
      {expanded && (
        <div id={`replay-case-${game.id}`} className="replay-case-detail">
          <div className="grid gap-3 sm:grid-cols-2">
            {GATES.map((gate) => (
              <div key={gate.key} className="flex gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${game.gates[gate.key] ? "bg-emerald-300" : "bg-amber-300/65"}`} />
                <div>
                  <div className="text-xs font-semibold text-stone-100">{gate.label} · {game.gates[gate.key] ? "Observed" : "Not verified"}</div>
                  <div className="mt-0.5 text-[11px] leading-5 text-stone-500">{gate.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><span className="replay-eyebrow text-stone-500">Players observed</span><p className="mt-1 text-xs leading-5 text-stone-300">{game.players.length ? game.players.join(" · ") : "No roster captured"}</p></div>
            <div><span className="replay-eyebrow text-stone-500">Format / build</span><p className="mt-1 text-xs leading-5 text-stone-300">{game.gameType} · {game.gameVersion}</p></div>
            <div><span className="replay-eyebrow text-stone-500">Current routing reason</span><p className="mt-1 break-words font-mono text-[11px] text-amber-100/75">{game.reason}</p></div>
            <div><span className="replay-eyebrow text-stone-500">Evidence requested</span><p className="mt-1 text-xs text-stone-300">{game.neededEvidence.length ? game.neededEvidence.join(" · ") : "No additional fields published"}</p></div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <span className="font-mono text-[10px] text-stone-500">{shortDate(game.playedAt)}</span>
            <Link href={`/game-stats/${game.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#e7c391] hover:text-white">
              Open game <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      )}
    </article>
  );
}

type CohortTab = "reason" | "owner" | "player" | "format" | "map";

export default function HdReplayEngine({ initial }: {
  initial: ReplayEngineSnapshot | null;
}) {
  const [data, setData] = useState(initial);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState(!initial);
  const [tab, setTab] = useState<CohortTab>("reason");
  const [query, setQuery] = useState("");
  const [onlyTeams, setOnlyTeams] = useState(false);
  const [opened, setOpened] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    setSyncing(true);
    try {
      const response = await fetch("/api/hd-replay-engine", { cache: "no-store" });
      if (!response.ok) throw new Error("Replay telemetry unavailable");
      const snapshot: ReplayEngineSnapshot = await response.json();
      if (snapshot.schema !== 1) throw new Error("Unknown replay telemetry schema");
      setData(snapshot);
      setLastError(false);
    } catch {
      setLastError(true);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
      void refresh();
    }, REFRESH_MS);
    const resumed = () => {
      setNow(Date.now());
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", resumed);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resumed);
    };
  }, [refresh]);

  const age = data ? Math.max(0, now - Date.parse(data.generatedAt)) : Infinity;
  const stale = !Number.isFinite(age) || age > 15 * 60_000;
  const counts = data?.counts;
  const unknown = data?.unknown;
  const parser = data?.parser;
  const groups = useMemo(() => ({
    reason: unknown?.reasons ?? [],
    owner: unknown?.owners ?? [],
    player: unknown?.participants ?? [],
    format: unknown?.formats ?? [],
    map: unknown?.maps ?? [],
  }), [unknown]);
  const cases = useMemo(() => (unknown?.cases ?? []).filter((game) => {
    if (onlyTeams && !game.gates.sidesVerified) return false;
    const search = query.trim().toLowerCase();
    return !search || [game.id, game.owner, game.mapName, game.gameType,
      game.reason, ...game.players].join(" ").toLowerCase().includes(search);
  }), [unknown, onlyTeams, query]);

  return (
    <main className="replay-shell min-h-screen w-full text-stone-100" data-replay-engine="v1">
      <div className="replay-grid-overlay" aria-hidden />
      <div className="relative mx-auto max-w-[1540px] space-y-5 px-3 py-6 sm:px-6 sm:py-8 xl:px-9">
        <header className="replay-command-deck">
          <div className="replay-command-scan" aria-hidden />
          <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="replay-id-plate"><ScanLine size={15} /> ENGINE / 02 / HD</span>
                <span className={`replay-live-label ${stale ? "replay-live-stale" : ""}`}><StatusLight subdued={stale} /> {data ? stale ? "EVIDENCE AGING" : "TELEMETRY CONNECTED" : "SIGNAL UNAVAILABLE"}</span>
              </div>
              <div className="mt-6">
                <div className="replay-eyebrow text-amber-200/55">AOE2WAR · FORENSIC ASSEMBLY</div>
                <h1 className="mt-3 font-serif text-[clamp(3.1rem,7vw,6.8rem)] leading-[0.91] tracking-[-0.065em] text-[#f3ede1]">
                  HD Replay<br /><span className="replay-title-metal">Engine.</span>
                </h1>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-stone-400">
                <span className="inline-flex items-center gap-2"><Database size={13} /> Final records → terminal proof</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck size={13} /> Winner authority never inferred</span>
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button type="button" className="replay-action" onClick={() => void refresh()} disabled={syncing}>
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Reading source…" : "Refresh telemetry"}
                </button>
                <Link className="replay-action-muted" href="/game-stats">Parser Observatory <ArrowUpRight size={13} /></Link>
              </div>
            </div>
            <div className="flex items-center justify-center"><EngineRing value={counts?.resultCoverageBps ?? 0}
              resolved={counts?.verifiedResult ?? 0} total={counts?.final ?? 0} /></div>
          </div>
          <div className="relative z-10 mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-[#c9a36d]/15 pt-4">
            <span className="replay-eyebrow text-stone-500">OBSERVATORY / PUBLIC FINAL-RECORD GRAIN</span>
            <span className="font-mono text-[10px] text-stone-400">{data ? `SOURCE ${shortDate(data.generatedAt)}` : "SOURCE UNAVAILABLE"} · 5 MIN CACHE</span>
          </div>
        </header>

        {lastError && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-900/15 p-4 text-xs text-amber-100" role="status">
            Could not refresh replay evidence. {data ? "Displaying the last known snapshot, not live activity." : "No verified snapshot is available. Counts remain unavailable."}
          </div>
        )}

        <section aria-label="Replay corpus key counts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Final replay records" value={counts ? integer(counts.final) : "—"}
            sub="Stored final ingestion rows · not deduped battles" tone="neutral" />
          <Stat label="Verified results" value={counts ? integer(counts.verifiedResult) : "—"}
            sub="Outcome defensible under public resolver" tone="green" />
          <Stat label="Unknown outcomes" value={counts ? integer(counts.unknownResult) : "—"}
            sub="No settlement-grade result inferred" tone="copper" />
          <Stat label="Teams verified" value={counts ? integer(counts.teamsVerified) : "—"}
            sub={counts ? `${percent(counts.teamCoverageBps)} of final records` : "Awaiting evidence"} tone="ice" />
        </section>

        <section className="replay-panel p-5 sm:p-7">
          <SectionIndex number="01" title="The verification line" marker="FOUR INDEPENDENT GATES" />
          <div className="replay-factory-grid">
            <div className="replay-factory-stage">
              <div className="replay-stage-head"><Database size={18} /><span>01 / INTAKE</span></div>
              <strong>{counts ? integer(counts.final) : "—"}</strong>
              <p>Final game records received</p>
              <Meter value={counts?.final ?? 0} max={counts?.final ?? 1} />
            </div>
            <div className="replay-factory-stage">
              <div className="replay-stage-head"><Users size={18} /><span>02 / TEAMS</span></div>
              <strong>{counts ? integer(counts.teamsVerified) : "—"}</strong>
              <p>Player sides verified</p>
              <Meter value={counts?.teamsVerified ?? 0} max={counts?.final ?? 1} tone="ice" />
            </div>
            <div className="replay-factory-stage">
              <div className="replay-stage-head"><Cpu size={18} /><span>03 / DECODER</span></div>
              <strong>{counts ? integer(counts.indexedParsed) : "—"}</strong>
              <p>Indexed artifacts decoded · separate file grain</p>
              <Meter value={counts?.indexedParsed ?? 0} max={counts?.indexedArtifacts ?? 1} tone="green" />
            </div>
            <div className="replay-factory-stage">
              <div className="replay-stage-head"><Target size={18} /><span>04 / WINNER</span></div>
              <strong>{counts ? integer(counts.verifiedResult) : "—"}</strong>
              <p>Defensible final results</p>
              <Meter value={counts?.verifiedResult ?? 0} max={counts?.final ?? 1} tone="copper" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-500">
            <span className="inline-flex items-center gap-2"><Waves size={14} /> Scanning visuals are ambient. Counts only change when source evidence changes.</span>
            <span>Artifacts ≠ final records ≠ unique battles</span>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="replay-panel p-5 sm:p-7">
            <SectionIndex number="02" title="Outcome blind spots" marker="FINAL RECORDS" />
            <div className="grid gap-5 sm:grid-cols-[.8fr_1.2fr]">
              <div className="replay-ratio">
                <span className="replay-eyebrow text-stone-500">UNRESOLVED</span>
                <strong>{counts ? integer(counts.unknownResult) : "—"}</strong>
                <span className="text-sm text-stone-400">{counts ? percent(10000 - counts.resultCoverageBps) : "—"} still unknown</span>
              </div>
              <div className="flex flex-col justify-center gap-3">
                <div className="replay-eyebrow text-stone-500">RESULT VERIFICATION RATIO</div>
                <div className="replay-split-meter">
                  <div style={{ width: `${(counts?.resultCoverageBps ?? 0) / 100}%` }} />
                </div>
                <div className="flex justify-between font-mono text-xs text-stone-400">
                  <span className="text-emerald-200/80">Verified {counts ? percent(counts.resultCoverageBps) : "—"}</span>
                  <span className="text-amber-200/80">Unknown {counts ? percent(10000 - counts.resultCoverageBps) : "—"}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="replay-subpanel"><span>Needs result only</span><strong>{counts ? integer(counts.logicalNeedsResultOnly) : "—"}</strong></div>
                  <div className="replay-subpanel"><span>Needs teams + result</span><strong>{counts ? integer(counts.logicalNeedsBoth) : "—"}</strong></div>
                </div>
              </div>
            </div>
          </div>
          <div className="replay-panel p-5 sm:p-7">
            <SectionIndex number="03" title="Full battle truth" marker="DEDUPLICATED PUBLIC BATTLES" />
            <div className="grid grid-cols-2 gap-3">
              <div className="replay-subpanel"><span>Logical battles</span><strong>{counts ? integer(counts.uniqueLogicalBattles) : "—"}</strong></div>
              <div className="replay-subpanel"><span>Fully proven</span><strong className="text-emerald-100">{counts ? integer(counts.logicalFullTruth) : "—"}</strong></div>
              <div className="replay-subpanel"><span>Still incomplete</span><strong className="text-amber-100">{counts ? integer(counts.logicalTruthUnknown) : "—"}</strong></div>
              <div className="replay-subpanel"><span>Needs teams only</span><strong>{counts ? integer(counts.logicalNeedsRosterOnly) : "—"}</strong></div>
            </div>
            <div className="mt-5 flex justify-between font-mono text-xs text-stone-400"><span>Complete winner + roster</span><span>{counts ? percent(counts.logicalFullCoverageBps) : "—"}</span></div>
            <div className="mt-2"><Meter value={counts?.logicalFullTruth ?? 0} max={counts?.uniqueLogicalBattles ?? 1} tone="green" /></div>
          </div>
        </section>

        <section className="replay-panel p-5 sm:p-7">
          <SectionIndex number="04" title="Where the machine jams" marker="UNRESOLVED OUTCOMES / TOP COHORTS" />
          <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Inspect unknown result cohorts">
            {([
              ["reason", "Why unknown"],
              ["owner", "By uploader"],
              ["player", "By player"],
              ["format", "Game format"],
              ["map", "Maps"],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={tab === id}
                className={`replay-filter ${tab === id ? "replay-filter-active" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="grid gap-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,.8fr)]">
            <LineDistribution rows={groups[tab]} total={tab === "player" ? undefined : counts?.unknownResult} tint={tab === "reason" ? "copper" : "ice"} />
            <div className="replay-machine-inset">
              <div className="replay-eyebrow text-stone-400">FORENSIC BOTTLENECK</div>
              <div className="mt-4 font-serif text-3xl text-[#e9dbbf]">{groups[tab][0]?.label ?? "No classified data"}</div>
              <div className="mt-3 font-mono text-4xl text-stone-100">{groups[tab][0] ? integer(groups[tab][0].count) : "—"}</div>
              <p className="mt-4 text-xs leading-5 text-stone-500">
                {tab === "player"
                  ? "Players can appear in multiple games. This panel counts appearances, not distinct unknown games."
                  : tab === "reason"
                    ? "A routing reason describes what is missing. It does not prove source-file corruption."
                    : "This is a cohort distribution of records with unresolved outcomes, not a cause-of-failure judgment."}
              </p>
              <div className="replay-mini-scanner mt-6" aria-hidden />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="replay-panel p-5 sm:p-7">
            <SectionIndex number="05" title="Decoder chamber" marker="INDEXED FILE-ARTIFACT GRAIN" />
            <div className="grid grid-cols-3 gap-3">
              <div className="replay-subpanel"><span>Indexed</span><strong>{counts ? integer(counts.indexedArtifacts) : "—"}</strong></div>
              <div className="replay-subpanel"><span>Decoded</span><strong>{counts ? integer(counts.indexedParsed) : "—"}</strong></div>
              <div className="replay-subpanel"><span>Failed latest</span><strong>{counts ? integer(counts.indexedFailed) : "—"}</strong></div>
            </div>
            <div className="mt-5"><LineDistribution rows={parser?.modes ?? []} limit={6} tint="green" /></div>
            <div className="mt-5 flex gap-2 text-xs leading-5 text-stone-500">
              <Info size={16} className="mt-0.5 shrink-0" /> Decoded means structured evidence extracted—not a proven result. Saved checkpoints ({counts ? integer(counts.checkpointArtifacts) : "—"}) are not completed battles.
            </div>
          </div>
          <div className="replay-panel p-5 sm:p-7">
            <SectionIndex number="06" title="Recovery rails" marker="CURRENT INDEXED PARSER FAILURES" />
            <div className="mb-5 flex items-center gap-4">
              <div className="replay-case-icon !h-12 !w-12"><HardDrive size={22} /></div>
              <div><div className="font-mono text-3xl text-stone-100">{parser ? integer(parser.failureTotal) : "—"}</div><div className="text-xs text-stone-500">Latest indexed runs requiring parser recovery</div></div>
            </div>
            <LineDistribution rows={parser?.failureLanes ?? []} tint="red"
              empty="No failed latest indexed parser runs. Unresolved outcomes may still lack terminal proof." />
            <p className="mt-6 text-xs leading-5 text-stone-500">
              A parse can succeed while the winner remains unknown. This lane only counts current indexed parser failures—not all unresolved games.
            </p>
          </div>
        </section>

        <section className="replay-panel p-5 sm:p-7">
          <SectionIndex number="07" title="The unresolved queue" marker="LATEST 24 FINAL RECORDS / READ-ONLY" />
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <label className="replay-search">
              <Search size={16} className="shrink-0 text-stone-500" />
              <input value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Game ID, player, map, owner, blocker…" aria-label="Filter visible unresolved games" />
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-stone-400">
              <input type="checkbox" checked={onlyTeams} onChange={(event) => setOnlyTeams(event.target.checked)}
                className="accent-amber-300" />
              Teams verified
            </label>
          </div>
          <div className="replay-queue-scroller">
            {cases.map((game) => (
              <CaseTile key={game.id} game={game} expanded={opened === game.id}
                onToggle={() => setOpened(opened === game.id ? null : game.id)} />
            ))}
            {!cases.length && <div className="p-10 text-center text-sm text-stone-500">{data ? "No games in this visible filter. Try another search." : "Waiting for public evidence."}</div>}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-stone-500">
            <span>Evidence gates are discrete checks (0–4), not a probabilistic “percent finished.”</span>
            <Link href="/game-stats" className="inline-flex items-center gap-1 text-amber-200/80 hover:text-white">Open full Parser Observatory <ArrowUpRight size={13} /></Link>
          </div>
        </section>

        <section className="replay-panel p-5 sm:p-7">
          <SectionIndex number="08" title="Machine telemetry" marker="OBSERVED · NEVER SIMULATED" />
          <div className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
            <div className="replay-machine-inset">
              <div className="replay-eyebrow text-stone-500">CUMULATIVE ACTIVITY</div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div><span className="block text-xs text-stone-500">Parser runs</span><strong className="font-mono text-2xl text-stone-100">{counts ? integer(counts.parserRuns) : "—"}</strong></div>
                <div><span className="block text-xs text-stone-500">Observations</span><strong className="font-mono text-2xl text-stone-100">{counts ? integer(counts.parserObservations) : "—"}</strong></div>
              </div>
              <div className="mt-5 border-t border-white/10 pt-4 text-xs leading-6 text-stone-400">
                <div className="flex items-center gap-2"><Radio size={15} className="text-amber-200" /> Public census refreshes from cached evidence.</div>
                <div className="mt-2 flex items-center gap-2"><Clock3 size={15} /> {data ? shortDate(data.generatedAt) : "Source unavailable"}</div>
                <div className="mt-2 flex items-center gap-2"><ShieldCheck size={15} /> No candidate promotion or Wolo mutation.</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="replay-eyebrow mb-4 text-stone-500">LATEST RECORDED PARSER JOBS · NOT CODEX LIVE STATUS</div>
              {(parser?.latestJobs ?? []).map((job) => (
                <div key={job.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/7 bg-black/20 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3"><StatusLight subdued /><div className="min-w-0"><span className="block truncate font-mono text-xs text-stone-200">JOB {job.id}</span><span className="text-[11px] text-stone-500">{job.lastEvent}</span></div></div>
                  <div className="text-right"><div className="font-mono text-[11px] text-amber-100/75">{job.status}</div><div className="mt-1 text-[10px] text-stone-500">{shortDate(job.createdAt)}</div></div>
                </div>
              ))}
              {!parser?.latestJobs.length && <div className="rounded-xl border border-dashed border-white/10 p-6 text-xs text-stone-500">No public parser job events have been published.</div>}
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-6 pt-2 text-[10px] uppercase tracking-[.13em] text-stone-500">
          <span className="flex items-center gap-2"><Gauge size={14} /> HD Replay Engine · evidence before verdict</span>
          <span>PRIVATE CODEX WORKTREE NOT CONNECTED · PUBLIC EVIDENCE ONLY</span>
          <Link href="/general-inspections" className="inline-flex items-center gap-1 hover:text-stone-100">General Inspections <ArrowUpRight size={12}/></Link>
        </footer>
      </div>
    </main>
  );
}
