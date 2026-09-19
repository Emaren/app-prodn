"use client";

import {
  Activity,
  BookOpenCheck,
  Boxes,
  ChevronDown,
  CircleDot,
  DatabaseZap,
  Gauge,
  HardDrive,
  RefreshCw,
  Rocket,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import type {
  GeneralInspectionsSnapshot,
  InspectionCategory,
  InspectionCheck,
  InspectionState,
} from "@/lib/generalInspections/types";
import styles from "./GeneralInspections.module.css";

const categoryIcons = {
  speed: Gauge,
  documentation: BookOpenCheck,
  organization: HardDrive,
  tests: TestTube2,
  release: Rocket,
  security: ShieldCheck,
  data: DatabaseZap,
} as const;

const stateClasses: Record<InspectionState, string> = {
  green: "text-emerald-300",
  amber: "text-amber-300",
  red: "text-rose-300",
};

const stateLabels: Record<InspectionState, string> = {
  green: "GREEN",
  amber: "WATCH",
  red: "ACTION",
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function ScoreRing({
  score,
  state,
  large = false,
}: {
  score: number;
  state: InspectionState;
  large?: boolean;
}) {
  const ringStyle = {
    "--score-angle": Math.max(0, Math.min(360, score * 3.6)) + "deg",
  } as React.CSSProperties;

  return (
    <div
      className={cx(styles.scoreRing, stateClasses[state], large && "!h-28 !w-28")}
      style={ringStyle}
      aria-label={score + " out of 100"}
    >
      <span className="text-center">
        <span className={large ? "block text-4xl font-black leading-none" : "block text-2xl font-black leading-none"}>
          {score}
        </span>
        <span className="mt-1 block text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
          / 100
        </span>
      </span>
    </div>
  );
}

function Ember({ state }: { state: InspectionState }) {
  return <span className={cx(styles.ember, stateClasses[state])} aria-hidden="true" />;
}

function RatioPill({ check }: { check: InspectionCheck }) {
  if (!check.ratio) return null;
  const pillClass =
    check.state === "green"
      ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200"
      : check.state === "amber"
        ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-200"
        : "border-rose-300/20 bg-rose-300/[0.08] text-rose-200";

  return (
    <span className={cx("inline-flex min-w-[5.6rem] items-center justify-center rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.08em]", pillClass)}>
      {check.ratio.passed}/{check.ratio.total}
      {check.ratio.label ? <span className="ml-1 text-[8px] opacity-60">{check.ratio.label}</span> : null}
    </span>
  );
}

function CategoryCard({
  category,
  selected,
  onSelect,
}: {
  category: InspectionCategory;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = categoryIcons[category.id as keyof typeof categoryIcons] ?? CircleDot;
  const healthy = category.checks.filter((item) => item.state === "green").length;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(styles.card, selected && styles.cardSelected, "group w-full rounded-[1.35rem] p-4 text-left sm:p-5")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-300/[0.045] text-sky-200/80">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Ember state={category.state} />
                <span className={cx("text-[9px] font-black uppercase tracking-[0.24em]", stateClasses[category.state])}>
                  {stateLabels[category.state]}
                </span>
              </div>
              <h2 className="mt-1 text-[15px] font-black tracking-tight text-white sm:text-base">{category.title}</h2>
            </div>
          </div>
          <p className="mt-3 max-w-[30rem] text-[11px] leading-5 text-slate-500">{category.description}</p>
        </div>
        <ScoreRing score={category.score} state={category.state} />
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">
          <span>{healthy}/{category.checks.length} green checks</span>
          <span>open inspection</span>
        </div>
        <div className={cx(styles.progressTrack, "mt-2")}>
          <div className={cx(styles.progressFill, stateClasses[category.state])} style={{ width: category.score + "%" }} />
        </div>
      </div>
    </button>
  );
}

function CheckRow({ check, index }: { check: InspectionCheck; index: number }) {
  const percentage = check.weight > 0 ? (check.earned / check.weight) * 100 : 0;
  return (
    <div className="grid gap-3 border-b border-white/[0.055] px-4 py-4 last:border-b-0 md:grid-cols-[2.4rem_minmax(0,1fr)_auto] md:items-center md:px-5">
      <div className="hidden text-[10px] font-black tabular-nums text-slate-700 md:block">{String(index + 1).padStart(2, "0")}</div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Ember state={check.state} />
          <h3 className="text-[13px] font-bold text-slate-100">{check.label}</h3>
          <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2 py-0.5 text-[9px] font-black tabular-nums text-slate-500">
            {check.earned.toFixed(check.earned % 1 ? 1 : 0)}/{check.weight} pts
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{check.detail}</p>
        <div className={cx(styles.progressTrack, "mt-2.5 max-w-xl")}>
          <div
            className={cx(styles.progressFill, stateClasses[check.state])}
            style={{ width: Math.max(0, Math.min(100, percentage)) + "%" }}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 md:justify-end">
        <RatioPill check={check} />
        {check.evidenceAt ? (
          <span className="min-w-[5.4rem] text-right text-[9px] text-slate-600">
            {new Date(check.evidenceAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function LoadingBoard() {
  return (
    <div className="grid min-h-[52vh] place-items-center">
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <RefreshCw className="h-4 w-4 animate-spin text-sky-300" />
        Reading inspection evidence…
      </div>
    </div>
  );
}

export default function GeneralInspections() {
  const [snapshot, setSnapshot] = useState<GeneralInspectionsSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("speed");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/general-inspections", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Inspection snapshot unavailable");
      const next = (await response.json()) as GeneralInspectionsSnapshot;
      setSnapshot(next);
      setError(null);
      if (!next.categories.some((item) => item.id === selectedId)) {
        setSelectedId(next.categories[0]?.id || "speed");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inspection snapshot unavailable");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const selected = useMemo(
    () => snapshot?.categories.find((item) => item.id === selectedId) ?? snapshot?.categories[0] ?? null,
    [selectedId, snapshot],
  );

  return (
    <main className={styles.shell}>
      <div className={styles.scan} />
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <section className={cx(styles.hero, "rounded-[1.7rem] px-5 py-6 sm:px-7 sm:py-7 lg:px-9")}>
          <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/10 bg-sky-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-sky-200/80">
                  <Activity className="h-3.5 w-3.5" />
                  General Inspections
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">live readiness ledger</span>
              </div>
              <h1 className="mt-4 font-serif text-4xl tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
                The kingdom checks itself.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
                Seven 100-point inspections turn SpeedOS, documentation, storage, tests, release receipts,
                security, and data truth into one live maintenance board. Evidence ages. Scores fall.
                Nothing stays green just because it was green yesterday.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-600">
                <span>Refresh · 30 seconds</span>
                <span>Release · {snapshot?.releaseSha?.slice(0, 12) || "—"}</span>
                <span>Build · {snapshot?.buildVersion || "—"}</span>
              </div>
            </div>
            {snapshot ? (
              <div className="flex items-center gap-5 rounded-2xl border border-white/[0.055] bg-black/15 px-5 py-4">
                <ScoreRing score={snapshot.overallScore} state={snapshot.overallState} large />
                <div>
                  <div className="flex items-center gap-2">
                    <Ember state={snapshot.overallState} />
                    <span className={cx("text-[10px] font-black uppercase tracking-[0.24em]", stateClasses[snapshot.overallState])}>
                      {stateLabels[snapshot.overallState]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-black text-white">Overall readiness</div>
                  <div className="mt-1 text-[10px] text-slate-500">{snapshot.categories.length} inspection systems</div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {!snapshot && !error ? <LoadingBoard /> : null}
        {error && !snapshot ? (
          <div className="mt-6 rounded-2xl border border-rose-300/15 bg-rose-300/[0.04] p-5 text-sm text-rose-200">{error}</div>
        ) : null}

        {snapshot ? (
          <>
            <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {snapshot.categories.map((inspection) => (
                <CategoryCard
                  key={inspection.id}
                  category={inspection}
                  selected={selected?.id === inspection.id}
                  onSelect={() => setSelectedId(inspection.id)}
                />
              ))}
            </section>

            {selected ? (
              <section className={cx(styles.card, "mt-5 rounded-[1.5rem]")}>
                <header className="flex flex-col gap-4 border-b border-white/[0.055] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Ember state={selected.state} />
                      <span className={cx("text-[9px] font-black uppercase tracking-[0.24em]", stateClasses[selected.state])}>
                        {stateLabels[selected.state]}
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.18em] text-slate-700">weighted inspection</span>
                    </div>
                    <h2 className="mt-1.5 text-2xl font-black tracking-tight text-white">{selected.title}</h2>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{selected.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={cx("text-3xl font-black tabular-nums", stateClasses[selected.state])}>
                        {selected.score}<span className="text-sm text-slate-600"> / 100</span>
                      </div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">current mark</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void load(true)}
                      disabled={refreshing}
                      className="grid h-10 w-10 place-items-center rounded-xl border border-sky-200/10 bg-sky-300/[0.04] text-sky-200/70 transition hover:bg-sky-300/[0.08] disabled:opacity-50"
                      title="Refresh inspections"
                    >
                      <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin")} />
                    </button>
                  </div>
                </header>
                <div>
                  {selected.checks.map((item, index) => <CheckRow key={item.id} check={item} index={index} />)}
                </div>
              </section>
            ) : null}

            {snapshot.notes.length ? (
              <details className="mt-4 rounded-2xl border border-white/[0.05] bg-black/15 px-4 py-3">
                <summary className="flex list-none items-center justify-between text-left">
                  <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <Boxes className="h-3.5 w-3.5" />
                    Inspection notes · {snapshot.notes.length}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-600" />
                </summary>
                <div className="mt-3 space-y-2 border-t border-white/[0.05] pt-3">
                  {snapshot.notes.map((note) => (
                    <p key={note} className="text-[11px] leading-5 text-slate-500">{note}</p>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="mt-3 text-right text-[9px] uppercase tracking-[0.15em] text-slate-700">
              Evidence read {new Date(snapshot.generatedAt).toLocaleString()}
            </div>
          </>
        ) : null}
      </div>
      <SpeedReadyMarker route="/general-inspections" ready={Boolean(snapshot)} />
    </main>
  );
}
