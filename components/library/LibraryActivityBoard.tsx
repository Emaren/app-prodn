"use client";

import {
  Activity,
  Archive,
  Box,
  CircleCheck,
  Database,
  Gauge,
  Layers3,
  PackageOpen,
  RadioTower,
  RefreshCw,
  Signal,
  UploadCloud,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";

type ActivityKind = "batch" | "manual" | "watcher";
type ActivityState = "active" | "complete" | "failed" | "stale";

type LibraryFeedItem = {
  id: string;
  kind: ActivityKind;
  state: ActivityState;
  occurredAt: string;
  warrior: string;
  uid: string | null;
  count: number;
  uploadedCount: number | null;
  parsedCount: number | null;
  resultReadyCount: number | null;
  duplicateCount: number | null;
  failedCount: number | null;
  label: string;
};

type ActiveBatch = {
  id: string;
  kind: "batch";
  state: ActivityState;
  warrior: string;
  uid: string | null;
  startedAt: string;
  occurredAt: string;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  seenCount: number;
  latestEventType: string;
  terminal: boolean;
};

type LibraryPayload = {
  ok: boolean;
  generatedAt: string;
  summary: {
    activeBatches: number;
    manualEvents24h: number;
    packageEvents24h: number;
    watcherEvents24h: number;
    gamesReceived24h: number;
  };
  activeBatches: ActiveBatch[];
  feed: LibraryFeedItem[];
};

const EMPTY: LibraryPayload = {
  ok: true,
  generatedAt: new Date(0).toISOString(),
  summary: {
    activeBatches: 0,
    manualEvents24h: 0,
    packageEvents24h: 0,
    watcherEvents24h: 0,
    gamesReceived24h: 0,
  },
  activeBatches: [],
  feed: [],
};

type FeedFilter = "all" | ActivityKind;

function ageLabel(value: string) {
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(delta / 1000);

  if (seconds < 10) return "NOW";
  if (seconds < 60) return `${seconds}S`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}M`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H`;

  return `${Math.floor(hours / 24)}D`;
}

function kindIcon(kind: ActivityKind) {
  if (kind === "batch") return PackageOpen;
  if (kind === "manual") return UploadCloud;
  return RadioTower;
}

function FeedPulse({
  item,
}: {
  item: LibraryFeedItem;
}) {
  const Icon = kindIcon(item.kind);

  const tone =
    item.kind === "batch"
      ? item.state === "active"
        ? "border-red-300/24 bg-[linear-gradient(120deg,rgba(127,29,29,0.20),rgba(20,5,8,0.92)_44%,rgba(4,8,14,0.96))] shadow-[0_0_35px_rgba(239,68,68,0.06)]"
        : "border-orange-200/12 bg-[linear-gradient(120deg,rgba(124,45,18,0.10),rgba(4,9,15,0.95))]"
      : item.kind === "manual"
        ? "border-cyan-200/12 bg-[linear-gradient(120deg,rgba(8,145,178,0.08),rgba(3,10,17,0.95))]"
        : "border-sky-200/[0.065] bg-[linear-gradient(120deg,rgba(14,116,144,0.025),rgba(3,8,14,0.82))]";

  const iconTone =
    item.kind === "batch"
      ? "text-red-300"
      : item.kind === "manual"
        ? "text-cyan-200"
        : "text-sky-400/55";

  return (
    <article
      className={`group relative overflow-hidden rounded-[20px] border p-3 transition duration-300 hover:border-white/20 ${tone} ${
        item.kind === "watcher" ? "opacity-65 hover:opacity-100" : ""
      }`}
    >
      {item.kind === "batch" && item.state === "active" ? (
        <>
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_18%_50%,rgba(239,68,68,0.10),transparent_32%)]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-red-300/60 shadow-[0_0_16px_rgba(248,113,113,0.7)]" />
        </>
      ) : null}

      <div className="relative flex items-center gap-3">
        <div
          className={`relative flex shrink-0 items-center justify-center rounded-[14px] border ${
            item.kind === "watcher"
              ? "h-9 w-9 border-sky-200/[0.07] bg-sky-300/[0.025]"
              : "h-11 w-11 border-white/[0.08] bg-white/[0.035]"
          }`}
        >
          {item.kind === "batch" && item.state === "active" ? (
            <span className="absolute h-8 w-8 animate-ping rounded-full border border-red-300/15" />
          ) : null}
          <Icon
            className={`${
              item.kind === "watcher" ? "h-3.5 w-3.5" : "h-4.5 w-4.5"
            } relative ${iconTone}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`truncate font-bold text-slate-100 ${
                item.kind === "watcher" ? "text-[12px]" : "text-sm"
              }`}
            >
              {item.warrior}
            </span>
            {item.state === "active" ? (
              <span className="rounded-full border border-red-300/18 bg-red-400/[0.08] px-2 py-0.5 font-mono text-[8px] font-bold tracking-[0.19em] text-red-200">
                LIVE
              </span>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.15em]">
            <span
              className={
                item.kind === "batch"
                  ? "text-red-200/60"
                  : item.kind === "manual"
                    ? "text-cyan-200/55"
                    : "text-sky-300/35"
              }
            >
              {item.label}
            </span>
            <span className="text-slate-700">×{item.count}</span>
            {item.resultReadyCount !== null ? (
              <span className="text-emerald-200/45">
                {item.resultReadyCount} READY
              </span>
            ) : null}
            {item.failedCount ? (
              <span className="text-red-200/55">
                {item.failedCount} ERR
              </span>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 font-mono text-[9px] font-semibold tracking-[0.16em] text-slate-700">
          {ageLabel(item.occurredAt)}
        </div>
      </div>
    </article>
  );
}

function ActiveBatchReactor({
  batch,
}: {
  batch: ActiveBatch;
}) {
  const total =
    batch.succeededCount +
    batch.failedCount +
    batch.skippedCount;

  return (
    <section className="relative min-h-[315px] overflow-hidden rounded-[30px] border border-red-300/20 bg-[radial-gradient(circle_at_22%_50%,rgba(239,68,68,0.18),transparent_32%),linear-gradient(120deg,rgba(45,7,12,0.96),rgba(8,4,9,0.985)_47%,rgba(2,8,14,0.98))] p-5 shadow-[0_0_80px_rgba(239,68,68,0.07),inset_0_0_60px_rgba(239,68,68,0.025)] sm:p-7">
      <style>{`
        @keyframes librarySweep {
          from { transform: translateX(-110%); }
          to { transform: translateX(310%); }
        }
        @keyframes libraryRing {
          0%,100% { transform: scale(.94); opacity:.22; }
          50% { transform: scale(1.08); opacity:.6; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(248,113,113,0.035)_48%,transparent_52%)] bg-[length:220px_100%]" />
      <div
        className="pointer-events-none absolute inset-y-0 w-[28%] bg-gradient-to-r from-transparent via-red-300/[0.055] to-transparent"
        style={{ animation: "librarySweep 4.8s linear infinite" }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-300/55 to-transparent shadow-[0_0_20px_rgba(248,113,113,.55)]" />

      <div className="relative flex h-full flex-col justify-between gap-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] border border-red-200/22 bg-red-500/[0.08] shadow-[0_0_35px_rgba(239,68,68,0.12)]">
              <span
                className="absolute inset-1 rounded-[19px] border border-red-300/20"
                style={{ animation: "libraryRing 1.8s ease-in-out infinite" }}
              />
              <PackageOpen className="relative h-7 w-7 text-red-200 drop-shadow-[0_0_12px_rgba(248,113,113,.8)]" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.32em] text-red-200/45">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,.9)]" />
                INTAKE LIVE
              </div>
              <div className="mt-2 truncate text-3xl font-black tracking-tight text-white sm:text-4xl">
                {batch.warrior}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-red-200/10 bg-black/20 px-3 py-2 font-mono text-[9px] font-bold tracking-[0.18em] text-red-100/45">
            {ageLabel(batch.occurredAt)}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.2em] text-red-100/30">
            <span>BATCH CHANNEL</span>
            <span>{batch.latestEventType.replaceAll("_", " ")}</span>
          </div>

          <div className="relative h-2 overflow-hidden rounded-full border border-red-200/10 bg-black/35">
            <div
              className="absolute inset-y-0 w-[34%] rounded-full bg-[linear-gradient(90deg,transparent,rgba(248,113,113,.9),rgba(251,146,60,.65),transparent)] shadow-[0_0_16px_rgba(248,113,113,.45)]"
              style={{ animation: "librarySweep 2.4s linear infinite" }}
            />
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2">
            {[
              ["SEEN", batch.seenCount],
              ["LANDED", batch.succeededCount],
              ["SKIP", batch.skippedCount],
              ["ERR", batch.failedCount],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-[14px] border border-red-100/[0.065] bg-black/20 px-3 py-3 text-center"
              >
                <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-red-100/28">
                  {label}
                </div>
                <div className="mt-1 font-mono text-xl font-black text-red-100/80">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-100/28">
              {total > 0 ? `${total} FILE EVENTS` : "AWAITING FILE EVENTS"}
            </div>
            <Signal className="h-4 w-4 text-red-300/45" />
          </div>
        </div>
      </div>
    </section>
  );
}

function QuietCore({
  item,
}: {
  item: LibraryFeedItem | null;
}) {
  const Icon = item ? kindIcon(item.kind) : Archive;

  return (
    <section className="relative min-h-[315px] overflow-hidden rounded-[30px] border border-cyan-200/[0.10] bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.09),transparent_31%),linear-gradient(130deg,rgba(3,17,27,0.97),rgba(2,7,14,0.985)_54%,rgba(5,7,18,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,.42)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(103,232,249,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,.04)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent" />

      <div className="relative flex h-full flex-col justify-between gap-12">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-cyan-200/16 bg-cyan-300/[0.055] shadow-[0_0_30px_rgba(34,211,238,.08)]">
              <Icon className="h-7 w-7 text-cyan-100/80" />
            </div>
            <div>
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.34em] text-cyan-100/35">
                LIBRARY CORE
              </div>
              <div className="mt-2 text-3xl font-black text-white sm:text-4xl">
                {item ? item.warrior : "STANDBY"}
              </div>
            </div>
          </div>
          <Activity className="h-5 w-5 text-cyan-200/25" />
        </div>

        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-100/40">
              {item?.label ?? "NO RECENT INTAKE"}
            </div>
            <div className="mt-2 font-mono text-2xl font-black text-cyan-100/80">
              {item ? `×${item.count}` : "—"}
            </div>
          </div>
          <div className="font-mono text-[9px] font-semibold tracking-[0.18em] text-slate-600">
            {item ? ageLabel(item.occurredAt) : "IDLE"}
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricNode({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "red" | "cyan" | "sky" | "amber" | "green";
}) {
  const styles = {
    red: "border-red-300/10 bg-red-400/[0.03] text-red-200/70",
    cyan: "border-cyan-300/10 bg-cyan-400/[0.03] text-cyan-200/70",
    sky: "border-sky-300/10 bg-sky-400/[0.03] text-sky-200/70",
    amber: "border-amber-300/10 bg-amber-400/[0.03] text-amber-200/70",
    green: "border-emerald-300/10 bg-emerald-400/[0.03] text-emerald-200/70",
  };

  return (
    <div
      className={`rounded-[18px] border p-4 ${styles[tone]}`}
      title={label}
    >
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-55" />
        <span className="font-mono text-2xl font-black">{value}</span>
      </div>
      <div className="mt-3 font-mono text-[8px] font-bold uppercase tracking-[0.2em] opacity-45">
        {label}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
        active
          ? "border-cyan-200/24 bg-cyan-300/[0.09] text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,.07)]"
          : "border-white/[0.065] bg-white/[0.025] text-slate-600 hover:border-white/15 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

export default function LibraryActivityBoard() {
  const [payload, setPayload] = useState<LibraryPayload>(EMPTY);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/library/activity", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Library activity unavailable");
      }

      const next = (await response.json()) as LibraryPayload;

      if (!next.ok || !Array.isArray(next.feed)) {
        throw new Error("Library activity invalid");
      }

      setPayload(next);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [load]);

  const feed = useMemo(
    () =>
      filter === "all"
        ? payload.feed
        : payload.feed.filter((item) => item.kind === filter),
    [filter, payload.feed]
  );

  const featured =
    payload.activeBatches[0] ??
    null;

  const latestMajor =
    payload.feed.find((item) => item.kind !== "watcher") ??
    payload.feed[0] ??
    null;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020409] text-white">
      <SpeedReadyMarker route="/library" ready={!loading && !failed} />

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(239,68,68,0.07),transparent_29%),radial-gradient(circle_at_100%_0%,rgba(34,211,238,0.09),transparent_31%),radial-gradient(circle_at_50%_100%,rgba(59,130,246,0.055),transparent_34%),linear-gradient(180deg,#05060b_0%,#020409_58%,#020308_100%)]" />
        <div className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(rgba(148,163,184,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.05)_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="absolute -left-32 top-[22%] h-[30rem] w-[30rem] rounded-full bg-red-600/[0.025] blur-[120px]" />
        <div className="absolute -right-32 top-[18%] h-[30rem] w-[30rem] rounded-full bg-cyan-500/[0.03] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1900px] px-3 py-5 sm:px-5 lg:px-8">
        <header className="relative overflow-hidden rounded-[30px] border border-white/[0.075] bg-[linear-gradient(120deg,rgba(15,10,16,0.95),rgba(3,10,17,0.97)_48%,rgba(3,13,22,0.96))] px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,.45)] sm:px-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(248,113,113,.08),transparent_26%),radial-gradient(circle_at_86%_0%,rgba(34,211,238,.07),transparent_28%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent" />

          <div className="relative flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-cyan-200/14 bg-cyan-300/[0.05] shadow-[0_0_26px_rgba(34,211,238,.06)]">
                <Archive className="h-6 w-6 text-cyan-100/80" />
              </div>

              <div className="min-w-0">
                <div className="font-mono text-[9px] font-bold uppercase tracking-[0.36em] text-slate-600">
                  REPLAY INTAKE // LIVE
                </div>
                <h1 className="mt-1 truncate text-3xl font-black tracking-[0.11em] text-white sm:text-4xl">
                  LIBRARY
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              title="Refresh Library"
              aria-label="Refresh Library"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.075] bg-white/[0.03] text-slate-500 transition hover:border-cyan-200/18 hover:text-cyan-100"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </header>

        <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.72fr)_minmax(300px,.58fr)]">
          <div>
            {featured ? (
              <ActiveBatchReactor batch={featured} />
            ) : (
              <QuietCore item={latestMajor} />
            )}
          </div>

          <aside className="grid grid-cols-2 gap-3 xl:grid-cols-1">
            <MetricNode
              icon={Activity}
              label="ACTIVE BATCH"
              value={payload.summary.activeBatches}
              tone="red"
            />
            <MetricNode
              icon={Database}
              label="GAMES / 24H"
              value={payload.summary.gamesReceived24h}
              tone="green"
            />
            <MetricNode
              icon={UploadCloud}
              label="MANUAL / 24H"
              value={payload.summary.manualEvents24h}
              tone="cyan"
            />
            <MetricNode
              icon={RadioTower}
              label="WATCHER / 24H"
              value={payload.summary.watcherEvents24h}
              tone="sky"
            />
            <MetricNode
              icon={Layers3}
              label="PACKS / 24H"
              value={payload.summary.packageEvents24h}
              tone="amber"
            />
          </aside>
        </section>

        <section className="mt-4 overflow-hidden rounded-[30px] border border-white/[0.07] bg-[linear-gradient(180deg,rgba(4,10,17,.94),rgba(2,6,11,.985))] shadow-[0_28px_90px_rgba(0,0,0,.4)]">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.055] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-cyan-200/45" />
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.28em] text-cyan-100/35">
                INTAKE STREAM
              </div>
              {failed ? (
                <span className="h-2 w-2 rounded-full bg-red-400 shadow-[0_0_12px_rgba(248,113,113,.7)]" />
              ) : (
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400/70 shadow-[0_0_12px_rgba(52,211,153,.45)]" />
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <FilterButton
                active={filter === "all"}
                title="All intake"
                onClick={() => setFilter("all")}
              >
                <Zap className="h-3.5 w-3.5" />
              </FilterButton>
              <FilterButton
                active={filter === "batch"}
                title="Batch uploads"
                onClick={() => setFilter("batch")}
              >
                <PackageOpen className="h-3.5 w-3.5" />
              </FilterButton>
              <FilterButton
                active={filter === "manual"}
                title="Manual uploads"
                onClick={() => setFilter("manual")}
              >
                <UploadCloud className="h-3.5 w-3.5" />
              </FilterButton>
              <FilterButton
                active={filter === "watcher"}
                title="Watcher uploads"
                onClick={() => setFilter("watcher")}
              >
                <RadioTower className="h-3.5 w-3.5" />
              </FilterButton>
            </div>
          </div>

          <div className="relative p-3 sm:p-4">
            <div className="pointer-events-none absolute bottom-0 left-[33px] top-0 w-px bg-gradient-to-b from-cyan-300/16 via-cyan-300/[0.045] to-transparent" />

            <div className="relative space-y-2">
              {feed.length ? (
                feed.map((item) => (
                  <FeedPulse key={item.id} item={item} />
                ))
              ) : (
                <div className="flex min-h-[260px] items-center justify-center">
                  <div className="text-center">
                    <Box className="mx-auto h-8 w-8 text-slate-800" />
                    <div className="mt-3 font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-slate-700">
                      INTAKE QUIET
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="mt-3 flex items-center justify-center gap-3 text-slate-800">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-current" />
          <CircleCheck className="h-3.5 w-3.5" />
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.32em]">
            GAME VAULT INTAKE
          </div>
          <CircleCheck className="h-3.5 w-3.5" />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-current" />
        </div>
      </div>
    </main>
  );
}
