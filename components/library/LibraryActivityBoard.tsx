"use client";

import Link from "next/link";
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Database,
  ExternalLink,
  Gauge,
  History,
  PackageOpen,
  RadioTower,
  RefreshCw,
  Signal,
  UploadCloud,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import LibraryPlayerCensus from "@/components/library/LibraryPlayerCensus";
import type { LibraryOrigin } from "@/lib/libraryLedger";

type GameStage = "checkpoint" | "review" | "recorded";
type GameItem = {
  id: number;
  ordinal: number;
  evidence: string;
  unknownOutcome: boolean;
  occurredAt: string;
  uploader: string;
  kind: LibraryOrigin;
  mapName: string | null;
  players: string[];
  gameType: string | null;
  stage: GameStage;
};
type PageResult = {
  ok: boolean;
  total: number;
  filterTotal: number;
  last24h: number;
  generatedAt: string;
  items: GameItem[];
  nextBefore: number | null;
  latestId: number | null;
  hasMore: boolean;
  mode: "latest" | "older" | "newer";
};
type OpsItem = {
  id: string;
  warrior: string;
  label: string;
  occurredAt: string;
  count: number;
  kind: "batch" | "watcher" | "manual";
  state: "active" | "complete" | "failed" | "stale";
};
type OpsPayload = {
  summary: {
    activeBatches: number;
    manualEvents24h: number;
    packageEvents24h: number;
    watcherEvents24h: number;
  };
  feed: OpsItem[];
};
type Filter = "all" | "watcher-live" | "watcher-batch" | "manual" | "manual-zip" | "other";

const ROW_HEIGHT = 108;
const VIEW_BUFFER = 8;
const emptyOps: OpsPayload = {
  summary: {
    activeBatches: 0,
    manualEvents24h: 0,
    packageEvents24h: 0,
    watcherEvents24h: 0,
  },
  feed: [],
};
const tones: Record<LibraryOrigin, {
  label: string;
  border: string;
  chip: string;
  light: string;
  glow: string;
}> = {
  "watcher-live": {
    label: "WATCHER · LIVE",
    border: "border-l-emerald-400/85",
    chip: "border-emerald-300/25 bg-emerald-400/[0.09] text-emerald-200",
    light: "text-emerald-300",
    glow: "bg-emerald-400",
  },
  "watcher-batch": {
    label: "WATCHER · BATCH",
    border: "border-l-rose-400/85",
    chip: "border-rose-300/25 bg-rose-400/[0.09] text-rose-200",
    light: "text-rose-300",
    glow: "bg-rose-400",
  },
  "watcher-legacy": {
    label: "WATCHER · LEGACY",
    border: "border-l-sky-400/75",
    chip: "border-sky-300/20 bg-sky-400/[0.07] text-sky-200",
    light: "text-sky-300",
    glow: "bg-sky-400",
  },
  "manual-zip": {
    label: "MANUAL · ZIP",
    border: "border-l-amber-300/85",
    chip: "border-amber-300/25 bg-amber-300/[0.10] text-amber-200",
    light: "text-amber-200",
    glow: "bg-amber-300",
  },
  manual: {
    label: "MANUAL · SINGLE",
    border: "border-l-cyan-300/85",
    chip: "border-cyan-300/25 bg-cyan-400/[0.09] text-cyan-200",
    light: "text-cyan-200",
    glow: "bg-cyan-300",
  },
  unclassified: {
    label: "SOURCE · UNCLASSIFIED",
    border: "border-l-slate-500/70",
    chip: "border-slate-500/20 bg-slate-400/[0.06] text-slate-400",
    light: "text-slate-400",
    glow: "bg-slate-400",
  },
};

function compactCount(n: number) {
  return Math.max(0, n).toLocaleString("en-US");
}
function age(iso: string) {
  const ms = Math.max(0, Date.now() - new Date(iso).getTime());
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
function receivedAt(iso: string) {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? "Time unavailable"
    : parsed.toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
}
function rosterLabel(names: string[]) {
  if (!names.length) return "Awaiting roster evidence";
  return names.slice(0, 4).join("  ·  ") +
    (names.length > 4 ? `  +${names.length - 4}` : "");
}
function sourceIcon(source: LibraryOrigin) {
  if (source === "watcher-live" || source === "watcher-legacy") return RadioTower;
  if (source === "watcher-batch" || source === "manual-zip") return PackageOpen;
  if (source === "manual") return UploadCloud;
  return Archive;
}

function LedgerRow({
  game,
  index,
  ordinal,
}: {
  game: GameItem;
  index: number;
  ordinal: number;
}) {
  const tone = tones[game.kind];
  const Icon = sourceIcon(game.kind);
  return (
    <article
      aria-posinset={index + 1}
      className={`group h-[108px] overflow-hidden border-b border-white/[0.055] border-l-[3px] bg-white/[0.015] transition-colors hover:bg-white/[0.065] ${tone.border}`}
      data-library-game-id={game.id}
      data-library-origin={game.kind}
    >
      <Link
        href={`/game-stats/${game.id}`}
        className="flex h-full items-center gap-3 px-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-200 sm:gap-5 sm:px-5"
        title={`Open recorded replay ${game.id}`}
      >
        <div
          className="w-12 shrink-0 text-right font-mono text-[10px] font-bold tabular-nums tracking-tight text-slate-600 sm:w-16 sm:text-[12px]"
          title="Final-replay record ordinal, newest first"
        >
          #{compactCount(Math.max(1, ordinal))}
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-black/25 ${tone.light}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="truncate text-sm font-black text-white sm:text-[15px]">{game.uploader}</span>
            <span className={`hidden shrink-0 rounded-full border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.1em] sm:inline-flex ${tone.chip}`}>
              {tone.label}
            </span>
            {game.evidence === "zip-legacy-correlation" ? (
              <span className="shrink-0 rounded-full border border-amber-300/25 px-2 py-0.5 font-mono text-[9px] text-amber-200" title="Older ZIP receipt uniquely correlates by uploader, filename and timing; not exact game-ID proof">INFERRED</span>
            ) : null}
          </div>
          <div className="mt-1.5 truncate text-xs text-slate-300/85 sm:text-sm">
            {game.mapName ?? (game.stage === "checkpoint" ? "Saved checkpoint" : "Battlefield pending")}
            <span className="mx-2 text-slate-700">/</span>
            <span className="text-slate-500">{game.gameType ?? "Recorded game"}</span>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-slate-500">
            {rosterLabel(game.players)}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <span className={`font-mono text-[9px] font-bold uppercase tracking-[0.1em] sm:hidden ${tone.light}`}>
            {game.kind === "watcher-live" ? "LIVE" : game.kind === "watcher-batch" ? "BATCH" :
              game.kind === "manual-zip" ? "ZIP" : game.kind === "manual" ? "MANUAL" : "OTHER"}
          </span>
          <span className="text-xs font-semibold tabular-nums text-slate-300">
            {receivedAt(game.occurredAt)}
          </span>
          <span className="flex items-center gap-2 font-mono text-[10px] text-slate-500">
            {game.stage === "review" ? "Outcome unknown / review" :
              game.stage === "checkpoint" ? "Checkpoint evidence" : age(game.occurredAt)}
            <ExternalLink className="h-3 w-3 opacity-0 transition group-hover:opacity-90" />
          </span>
        </div>
      </Link>
    </article>
  );
}

function Metric({ icon: Icon, caption, value, accent }: {
  icon: typeof Activity;
  caption: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/25 px-4 py-3">
      <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.17em] text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${accent}`} />
        {caption}
      </div>
      <div className="mt-2 font-mono text-2xl font-black tabular-nums text-slate-100">{value}</div>
    </div>
  );
}

export default function LibraryActivityBoard() {
  const [items, setItems] = useState<GameItem[]>([]);
  const [pending, setPending] = useState<GameItem[]>([]);
  const pendingRef = useRef<GameItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [total, setTotal] = useState(0);
  const [filterTotal, setFilterTotal] = useState(0);
  const [last24h, setLast24h] = useState(0);
  const [ops, setOps] = useState<OpsPayload>(emptyOps);
  const [showOperations, setShowOperations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(700);
  const [hasMore, setHasMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef(0);
  const olderRef = useRef<number | null>(null);
  const moreRef = useRef(false);
  const olderBusyRef = useRef(false);
  const pollBusyRef = useRef(false);
  const filterEpochRef = useRef(0);

  const requestPage = useCallback(async (query = ""): Promise<PageResult> => {
    const response = await fetch(`/api/library/games${query}${query ? "&" : "?"}origin=${encodeURIComponent(filter)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Library ledger unavailable");
    const data = await response.json() as PageResult;
    if (!data.ok || !Array.isArray(data.items) || !Number.isInteger(data.total)) {
      throw new Error("Invalid Library ledger");
    }
    return data;
  }, [filter]);

  const refreshOperations = useCallback(async () => {
    try {
      const response = await fetch("/api/library/activity", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as OpsPayload;
      if (Array.isArray(result.feed) && result.summary) setOps(result);
    } catch {
      // An optional telemetry panel must not take the game ledger offline.
    }
  }, []);

  const firstPage = useCallback(async () => {
    const epoch = ++filterEpochRef.current;
    setLoading(true);
    try {
      const data = await requestPage();
      if (epoch !== filterEpochRef.current) return;
      setItems(data.items);
      setTotal(data.total);
      setFilterTotal(data.filterTotal);
      setLast24h(data.last24h);
      pendingRef.current = [];
      setPending([]);
      headRef.current = data.latestId ?? 0;
      olderRef.current = data.nextBefore;
      moreRef.current = data.hasMore;
      setHasMore(data.hasMore);
      setFailed(false);
      setScrollTop(0);
      scrollRef.current?.scrollTo({ top: 0 });
    } catch {
      if (epoch === filterEpochRef.current) setFailed(true);
    } finally {
      if (epoch === filterEpochRef.current) setLoading(false);
    }
  }, [requestPage]);

  const loadOlder = useCallback(async () => {
    const cursor = olderRef.current;
    if (olderBusyRef.current || !moreRef.current || cursor === null) return;
    const epoch = filterEpochRef.current;
    olderBusyRef.current = true;
    setLoadingOlder(true);
    try {
      const data = await requestPage(`?before=${cursor}`);
      if (epoch !== filterEpochRef.current) return;
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...data.items.filter((item) => !known.has(item.id))];
      });
      olderRef.current = data.nextBefore;
      moreRef.current = data.hasMore;
      setHasMore(data.hasMore);
      setFailed(false);
    } catch {
      if (epoch === filterEpochRef.current) setFailed(true);
    } finally {
      olderBusyRef.current = false;
      setLoadingOlder(false);
    }
  }, [requestPage]);

  const poll = useCallback(async () => {
    const epoch = filterEpochRef.current;
    if (pollBusyRef.current) return;
    if (headRef.current === 0) {
      await firstPage();
      return;
    }
    pollBusyRef.current = true;
    try {
      // The server serves these in ascending order, so an intake burst cannot
      // jump over more than one page of newly created record IDs.
      for (let page = 0; page < 5; page++) {
        const data = await requestPage(`?after=${headRef.current}`);
        if (epoch !== filterEpochRef.current) return;
        setTotal(data.total);
        setFilterTotal(data.filterTotal);
        setLast24h(data.last24h);
        if (data.items.length === 0) break;
        headRef.current = Math.max(headRef.current, ...data.items.map((item) => item.id));

        if ((scrollRef.current?.scrollTop ?? 0) < 100) {
          const arrivals = [...data.items, ...pendingRef.current];
          pendingRef.current = [];
          setPending([]);
          setItems((current) => {
            const known = new Set(current.map((item) => item.id));
            return [...arrivals.filter((item) => !known.has(item.id)), ...current]
              .sort((a, b) => b.id - a.id);
          });

        } else {
          const known = new Set(pendingRef.current.map((item) => item.id));
          pendingRef.current = [...data.items.filter((item) => !known.has(item.id)), ...pendingRef.current]
            .sort((a, b) => b.id - a.id);
          setPending(pendingRef.current);
        }
        if (!data.hasMore) break;
      }
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      pollBusyRef.current = false;
    }
  }, [firstPage, requestPage]);

  const jumpToNewest = useCallback(() => {
    if (pendingRef.current.length) {
      const arrivals = pendingRef.current;
      pendingRef.current = [];
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...arrivals.filter((item) => !known.has(item.id)), ...current]
          .sort((a, b) => b.id - a.id);
      });
      setPending([]);

    }
    setFilter("all");
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    void firstPage();
    void refreshOperations();
  }, [firstPage, refreshOperations]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void poll();
        void refreshOperations();
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [poll, refreshOperations]);

  useEffect(() => {
    const update = () => {
      if (scrollRef.current) setViewportHeight(scrollRef.current.clientHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const visible = useMemo(
    () => items.map((item) => ({ item, ordinal: item.ordinal })),
    [items],
  );
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VIEW_BUFFER);
  const end = Math.min(visible.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + VIEW_BUFFER);
  const windowed = visible.slice(start, end);
  const latest = items[0] ?? null;
  const latestTone = latest ? tones[latest.kind] : null;

  return (
    <main className="relative min-h-screen bg-[#05070d] px-3 pb-16 pt-5 text-white sm:px-5 lg:px-8" data-library-ledger>
      <SpeedReadyMarker route="/library" ready={!loading && !failed} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_9%_0%,rgba(234,179,8,.07),transparent_27%),radial-gradient(circle_at_91%_15%,rgba(14,165,233,.08),transparent_31%),linear-gradient(180deg,#080b14,#05070d_45%)]" />
        <div className="absolute inset-0 opacity-[.09] [background-image:linear-gradient(rgba(148,163,184,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.1)_1px,transparent_1px)] [background-size:48px_48px]" />
      </div>
      <div className="relative mx-auto max-w-[1640px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-100/[0.12] pb-5">
          <div>
            <div className="flex items-center gap-3 font-mono text-[10px] font-black uppercase tracking-[0.32em] text-amber-200/70">
              <Archive className="h-4 w-4" />
              REPLAY INTAKE // LIVE
            </div>
            <h1 className="mt-2 font-black text-4xl tracking-[0.06em] sm:text-5xl">
              THE <span className="bg-gradient-to-r from-amber-100 to-amber-500 bg-clip-text text-transparent">LIBRARY</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Every durable replay. Every uploader. Newest on top. The kingdom never stops recording.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[0.045] px-4 py-2 font-mono text-[10px] font-black tracking-[0.15em] text-emerald-200">
              <span className={`h-2 w-2 rounded-full ${failed ? "bg-red-400" : "animate-pulse bg-emerald-400"}`} />
              {failed ? "RECONNECTING" : "LIVE INTAKE · 5S"}
            </span>
            <button
              type="button"
              onClick={() => void poll()}
              aria-label="Refresh Library"
              title="Refresh Library"
              className="rounded-xl border border-white/15 p-3 text-slate-300 transition hover:border-amber-300/40 hover:text-amber-200"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(340px,.85fr)]">
          <div className="relative overflow-hidden rounded-[24px] border border-amber-200/15 bg-[linear-gradient(120deg,rgba(39,26,12,.8),rgba(5,12,22,.97)_56%)] p-5 shadow-[0_12px_60px_rgba(0,0,0,.36)] sm:p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-amber-300/50 via-transparent to-cyan-400/40" />
            <div className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.22em] text-amber-200/75">
              <Zap className="h-4 w-4" />
              LATEST ARRIVAL
            </div>
            {latest ? (
              <div className="mt-4 flex min-w-0 items-center gap-4">
                <div className={`h-14 w-1 shrink-0 rounded-full ${latestTone?.glow ?? "bg-amber-300"}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {latest.uploader}
                  </div>
                  <div className="mt-1 truncate text-sm text-slate-300">
                    {latest.mapName ?? "Unresolved battlefield"}
                    <span className="mx-2 text-slate-600">·</span>
                    {rosterLabel(latest.players)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${latestTone?.chip ?? ""}`}>
                      {latestTone?.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {receivedAt(latest.occurredAt)}
                    </span>
                    <Link href={`/game-stats/${latest.id}`} className="text-[11px] font-bold text-amber-200 hover:underline">
                      Inspect replay ↗
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-xl font-bold text-slate-400">
                {loading ? "Connecting to the game ledger…" : "Awaiting first final replay"}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={Database} caption="Final replay records" value={compactCount(total)} accent="text-amber-300" />
            <Metric icon={Activity} caption="Received / 24h" value={compactCount(last24h)} accent="text-emerald-300" />
            <Metric icon={RadioTower} caption="Active batches" value={compactCount(ops.summary.activeBatches)} accent="text-rose-300" />
            <Metric icon={History} caption="Loaded history" value={compactCount(items.length)} accent="text-cyan-300" />
          </div>
        </section>

        <section className="overflow-hidden rounded-[25px] border border-white/[0.11] bg-[#070d16]/95 shadow-[0_28px_100px_rgba(0,0,0,.45)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] bg-white/[0.018] px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-amber-300" />
              <div>
                <h2 className="text-lg font-black tracking-[0.04em] text-white">THE INTAKE LEDGER</h2>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                  FINAL REPLAY RECORDS · INTAKE ORDER · INFINITE HISTORY
                </p>
              </div>
            </div>
            <button type="button" onClick={jumpToNewest}
              className="flex items-center gap-2 rounded-xl border border-amber-200/20 bg-amber-200/[.06] px-3 py-2 text-xs font-bold text-amber-100 transition hover:bg-amber-200/[.12]">
              <ArrowUp className="h-4 w-4" />
              Jump to latest
              {pending.length ? <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] text-black">{pending.length} NEW</span> : null}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-white/[0.06] px-4 py-3 sm:px-6" role="group" aria-label="Filter intake origins">
            {([
              ["all", "All sources"],
              ["watcher-live", "Watcher live"],
              ["watcher-batch", "Watcher batch"],
              ["manual", "Manual single"],
              ["manual-zip", "Manual ZIP"],
              ["other", "Legacy / other"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  filterEpochRef.current++;
                  setFilter(value);
                  setItems([]);
                  setLoading(true);
                  scrollRef.current?.scrollTo({ top: 0 });
                  setScrollTop(0);
                }}
                className={`rounded-lg border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.11em] transition ${filter === value
                  ? "border-amber-200/35 bg-amber-300/[0.13] text-amber-100"
                  : "border-white/[0.07] bg-white/[0.025] text-slate-500 hover:border-white/20 hover:text-slate-200"}`}
              >{label}</button>
            ))}
          </div>
          {pending.length ? (
            <button type="button" onClick={jumpToNewest}
              className="flex w-full items-center justify-center gap-2 border-b border-emerald-200/15 bg-emerald-300/[.09] px-4 py-3 text-xs font-bold text-emerald-100 hover:bg-emerald-300/[.14]">
              <ArrowUp className="h-4 w-4" />
              {pending.length} fresh replay{pending.length === 1 ? "" : "s"} landed · Show newest
            </button>
          ) : null}
          <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/25 px-4 py-2 font-mono text-[10px] text-slate-500 sm:px-6">
            <span>{compactCount(visible.length)} loaded of {compactCount(filterTotal)} matching records · newest first</span>
            <span>SCROLL ↓ FOR HISTORY</span>
          </div>
          <div
            ref={scrollRef}
            role="feed"
            aria-label="Chronological game intake ledger"
            aria-busy={loadingOlder}
            onScroll={(event) => {
              const element = event.currentTarget;
              setScrollTop(element.scrollTop);
              if (element.scrollTop + element.clientHeight > element.scrollHeight - 500) {
                void loadOlder();
              }
            }}
            className="h-[min(72vh,860px)] min-h-[350px] overflow-y-auto overscroll-contain [scrollbar-color:rgba(165,175,195,.36)_transparent]"
            data-library-scroll
          >
            {visible.length ? (
              <>
                <div style={{ height: start * ROW_HEIGHT }} aria-hidden="true" />
                {windowed.map(({ item, ordinal }, index) => (
                  <LedgerRow
                    key={item.id}
                    game={item}
                    index={start + index}
                    ordinal={ordinal}
                  />
                ))}
                <div style={{ height: Math.max(0, visible.length - end) * ROW_HEIGHT }} aria-hidden="true" />
              </>
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
                <Archive className="h-10 w-10 text-amber-300/30" />
                <div className="text-sm text-slate-400">
                  {loading ? "Loading the kingdom's replay history…" :
                    failed ? "The intake ledger is temporarily unavailable." :
                    filter !== "all" ? "No records of this source in the complete historical ledger." :
                    "No final replay records yet."}
                </div>
              </div>
            )}
            {loadingOlder && (
              <div className="px-4 py-3 text-center font-mono text-xs text-amber-200">
                Loading earlier records…
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Signal className="h-3.5 w-3.5 text-emerald-300" />
              {hasMore ? "More preserved history available" : "End of indexed source history"}
              {filter !== "all" ? " · Full-history source filter active" : ""}
            </div>
            {hasMore ? (
              <button type="button" disabled={loadingOlder} onClick={() => void loadOlder()}
                className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 transition hover:border-amber-200/30 disabled:opacity-40">
                <ArrowDown className="h-3.5 w-3.5" />
                {loadingOlder ? "Loading…" : "Load older 48"}
              </button>
            ) : null}
          </div>
          {failed && (
            <div className="border-t border-red-300/20 bg-red-400/[.06] px-5 py-3 text-xs text-red-200">
              Library connection interrupted. Saved history remains visible; use Refresh to retry.
            </div>
          )}
        </section>

        <section className="rounded-[25px] border border-white/[0.07] bg-black/20">
          <button type="button" aria-expanded={showOperations}
            onClick={() => setShowOperations(!showOperations)}
            className="flex w-full flex-wrap items-center justify-between gap-4 p-5 text-left sm:p-6">
            <div className="flex items-center gap-3">
              <Activity className="h-5 w-5 text-sky-300" />
              <div>
                <h2 className="text-sm font-black tracking-[0.12em] text-slate-100">INTAKE OPERATIONS</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Live batch telemetry and upload-event diagnostics · separate from numbered games
                </p>
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showOperations ? "rotate-180" : ""}`} />
          </button>
          {showOperations ? (
            <div className="grid gap-4 border-t border-white/[0.07] p-5 sm:p-6 lg:grid-cols-[300px_minmax(0,1fr)]">
              <div className="space-y-3">
                <Metric icon={PackageOpen} caption="ZIP uploads / 24h" value={compactCount(ops.summary.packageEvents24h)} accent="text-amber-300" />
                <Metric icon={UploadCloud} caption="Manual events / 24h" value={compactCount(ops.summary.manualEvents24h)} accent="text-cyan-300" />
                <Metric icon={RadioTower} caption="Watcher events / 24h" value={compactCount(ops.summary.watcherEvents24h)} accent="text-emerald-300" />
              </div>
              <div className="space-y-2">
                <h3 className="pb-2 font-mono text-[10px] font-bold tracking-[0.2em] text-slate-500">RECENT CHANNEL ACTIVITY</h3>
                {ops.feed.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-200">{event.warrior}</span>
                    <span className="font-mono text-[10px] text-slate-500">{event.label} ×{event.count}</span>
                    <span className="font-mono text-[10px] text-slate-600">{age(event.occurredAt)}</span>
                  </div>
                ))}
                {!ops.feed.length ? <p className="text-xs text-slate-600">No recent upload telemetry.</p> : null}
              </div>
            </div>
          ) : null}
        </section>
        <LibraryPlayerCensus />
        <p className="text-center font-mono text-[10px] leading-relaxed text-slate-600">
          INTAKE LEDGER ≠ DEDUPLICATED WAR VAULT · FINAL REPLAY EVIDENCE ≠ VERIFIED VICTORY OR BETTING AUTHORITY
          <br />
          Each number represents a stored final replay record, not necessarily one unique battle.
          <Link href="/battle-archive" className="ml-2 text-amber-200/80 hover:underline">Explore the War Vault ↗</Link>
        </p>
      </div>
    </main>
  );
}
