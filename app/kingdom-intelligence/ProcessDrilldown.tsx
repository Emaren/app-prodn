"use client";

import { useEffect, useState } from "react";

import type { LiveRecoveryProgress } from "./useLiveRecoveryProgress";

type DetailKind = "agent" | "event" | "process";

type Props = {
  kind?: DetailKind;
  systemKey?: string | null;
  system: string;
  status: string;
  summary: string;
  progress: number | null;
  progressLabel: string | null;
  startedAt?: string | null;
  proof?: string | null;
  current?: boolean;
  currentStep?: string | null;
  etaSeconds?: number | null;
  elapsedSeconds?: number | null;
  sealedChunks?: number | null;
  observedBytes?: number | null;
  expectedBytes?: number | null;
  throughputBytesPerSecond?: number | null;
  progressBasis?: string | null;
  liveRecovery?: LiveRecoveryProgress | null;
};

const EXPLAINERS: Record<
  string,
  { what: string; why: string; next: string }
> = {
  recovery: {
    what:
      "Recovery OS is making encrypted survival copies of AoE2WAR data that source control cannot restore.",
    why:
      "If a server or storage volume dies, these copies are what let the kingdom rebuild instead of starting over.",
    next:
      "Finish this class, verify the encrypted chunks can be restored, then seal the class before moving on.",
  },
  release: {
    what:
      "Release OS keeps GitHub, the deployed site, and the certified runtime aligned.",
    why:
      "It prevents the live site from quietly drifting away from the source we believe is running.",
    next:
      "Bring certified production to the intended source and prove the exact release.",
  },
  workspace: {
    what:
      "Workspace OS keeps parallel branches and worktrees organized while several jobs are being built at once.",
    why:
      "It reduces accidental overwrites, stale branches, and confusion about which work is still alive.",
    next:
      "Finish or retire old workstreams and keep the canonical checkout clean.",
  },
  storage: {
    what:
      "Storage OS watches disk capacity, retained generations, and storage health.",
    why:
      "Healthy free space keeps captures, builds, databases, and backups from colliding with a full disk.",
    next:
      "Reclaim or rotate storage when the evidence says maintenance is due.",
  },
  replay_truth: {
    what:
      "Replay Truth OS decides what replay evidence can actually prove about games, teams, and winners.",
    why:
      "AoE2WAR should never invent a winner just because the answer would be convenient.",
    next:
      "Resolve the next deterministic evidence frontier without weakening proof standards.",
  },
  speed: {
    what:
      "Speed OS measures how quickly the real site becomes usable and tracks the routes that need work.",
    why:
      "It turns 'the site feels slow' into measurable evidence we can improve release by release.",
    next:
      "Re-benchmark the current release and attack the largest proven latency targets.",
  },
  documentation: {
    what:
      "Documentation OS keeps the project map and operating rules synchronized with what the system actually does.",
    why:
      "Future work is safer when the written control plane matches the real estate.",
    next:
      "Refresh any documentation whose implementation evidence has changed.",
  },
  host: {
    what:
      "Host OS watches the server itself: updates, reboot requirements, service health, and machine hygiene.",
    why:
      "A perfect application still fails if the machine underneath it is unhealthy.",
    next:
      "Apply safe maintenance when the release and recovery windows allow it.",
  },
  doctor: {
    what:
      "System Doctor combines health evidence from the estate into one operating score.",
    why:
      "It gives us a fast answer to whether something important needs attention.",
    next:
      "Clear the highest-severity finding first, then re-run the health proof.",
  },
};

function friendlyDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "—";
  }
  if (seconds < 60) return "< 1 min";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `~${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `~${hours}h ${remainder}m` : `~${hours}h`;
}

function friendlyBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let amount = Math.max(0, value);
  let index = 0;

  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }

  return `${amount.toFixed(index >= 3 ? 2 : 1)} ${units[index]}`;
}

function friendlyRate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${friendlyBytes(value)}/s`;
}

function friendlyTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 border-l border-white/8 pl-3 first:border-l-0 first:pl-0">
      <div className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
        {label}
      </div>
      <div
        className={
          "mt-1 truncate text-xs font-semibold " +
          (accent ? "text-cyan-100" : "text-slate-200")
        }
      >
        {value}
      </div>
    </div>
  );
}

export default function ProcessDrilldown({
  kind = "agent",
  systemKey,
  system,
  status,
  summary,
  progress,
  progressLabel,
  startedAt,
  proof,
  current = false,
  currentStep,
  etaSeconds: snapshotEtaSeconds,
  elapsedSeconds: snapshotElapsedSeconds,
  sealedChunks: snapshotSealedChunks,
  observedBytes: snapshotObservedBytes,
  expectedBytes: snapshotExpectedBytes,
  throughputBytesPerSecond: snapshotThroughput,
  progressBasis: snapshotProgressBasis,
  liveRecovery,
}: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const key =
    systemKey ??
    system.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

  const explainer = EXPLAINERS[key] ?? {
    what: `${system} is one of the kingdom's operating signals.`,
    why:
      "The row exists because the system has evidence worth exposing without dumping raw operator internals.",
    next:
      current
        ? "Let the active work finish, then verify its result."
        : "Watch the next state change and inspect the evidence when it moves.",
  };

  const liveRecoveryActive =
    key === "recovery" && liveRecovery?.available === true;

  const liveProgress =
    liveRecoveryActive && typeof liveRecovery?.overallPercent === "number"
      ? liveRecovery.overallPercent
      : null;
  const effectiveProgress = liveProgress ?? progress;

  const startedMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const elapsedSeconds = Number.isFinite(startedMs) && current
    ? Math.max(0, Math.round((now - startedMs) / 1000))
    : liveRecoveryActive
      ? liveRecovery?.elapsedSeconds ?? snapshotElapsedSeconds ?? null
      : snapshotElapsedSeconds ?? null;

  const etaSeconds =
    liveRecoveryActive && typeof liveRecovery?.etaSeconds === "number"
      ? liveRecovery.etaSeconds
      : snapshotEtaSeconds ?? null;

  const detailCurrentStep =
    liveRecoveryActive
      ? liveRecovery?.currentClass ?? currentStep
      : currentStep;
  const detailSealedChunks =
    liveRecoveryActive
      ? liveRecovery?.sealedChunks ?? snapshotSealedChunks
      : snapshotSealedChunks;
  const detailObservedBytes =
    liveRecoveryActive
      ? liveRecovery?.observedBytes ?? snapshotObservedBytes
      : snapshotObservedBytes;
  const detailExpectedBytes =
    liveRecoveryActive
      ? liveRecovery?.expectedBytes ?? snapshotExpectedBytes
      : snapshotExpectedBytes;
  const detailThroughput =
    liveRecoveryActive
      ? liveRecovery?.throughputBytesPerSecond ?? snapshotThroughput
      : snapshotThroughput;
  const detailProgressBasis =
    liveRecoveryActive
      ? liveRecovery?.progressBasis ?? snapshotProgressBasis
      : snapshotProgressBasis;

  const processMode = kind === "process" || liveRecoveryActive;

  if (kind === "event" && !processMode) {
    return (
      <div
        data-process-drilldown-kind="event"
        className="mt-3 rounded-xl border border-white/8 bg-white/[0.018] px-4 py-3 text-left"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
            Sealed event
          </div>
          <span className="rounded-full border border-white/8 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
            {status}
          </span>
        </div>

        <div className="mt-2 text-[11px] leading-5 text-slate-200">
          {summary}
        </div>

        <div className="mt-3 border-t border-white/6 pt-3 text-[10px] leading-5 text-slate-500">
          This is a completed {system} event, not a running process. There is no
          live ETA to estimate.
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9px] text-slate-700">
          <span>recorded {friendlyTimestamp(startedAt)}</span>
          {proof ? <span>proof {proof}</span> : null}
        </div>
      </div>
    );
  }

  if (processMode) {
    const progressText =
      effectiveProgress === null ? "LIVE" : `${effectiveProgress.toFixed(1)}%`;
    const capturedText =
      detailExpectedBytes !== null && detailExpectedBytes !== undefined
        ? `${friendlyBytes(detailObservedBytes)} / ${friendlyBytes(detailExpectedBytes)}`
        : friendlyBytes(detailObservedBytes);

    return (
      <div
        data-process-drilldown-kind="process"
        className="mt-3 overflow-hidden rounded-xl border border-cyan-200/12 bg-[#040a12] text-left shadow-[inset_0_1px_0_rgba(255,255,255,.02)]"
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[8px] font-black uppercase tracking-[0.22em] text-cyan-100/45">
                Live process
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-slate-100">
                {detailCurrentStep ?? summary}
              </div>
            </div>

            <div className="shrink-0 text-right">
              <div className="text-xl font-semibold tracking-tight text-cyan-100">
                {progressText}
              </div>
              <div className="mt-0.5 text-[8px] uppercase tracking-[0.16em] text-slate-600">
                overall
              </div>
            </div>
          </div>

          {effectiveProgress !== null ? (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/7">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-amber-200 to-emerald-300 transition-[width] duration-700"
                  style={{
                    width:
                      Math.max(0, Math.min(100, effectiveProgress)) + "%",
                  }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-3 text-[9px] text-slate-600">
                <span className="truncate">
                  {progressLabel ?? detailProgressBasis ?? "live evidence"}
                </span>
                {liveRecoveryActive ? <span>5s signal</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-y-4 border-t border-white/6 px-4 py-3">
          <Metric
            label="ETA"
            value={
              etaSeconds !== null
                ? friendlyDuration(etaSeconds)
                : "Calculating…"
            }
            accent
          />
          <Metric label="Captured" value={capturedText} />
          <Metric label="Pace" value={friendlyRate(detailThroughput)} />
          <Metric label="Elapsed" value={friendlyDuration(elapsedSeconds)} />
        </div>

        <div className="border-t border-white/6 px-4 py-3">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
            What it does
          </div>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">
            {explainer.what}
          </p>

          <div className="mt-3 text-[8px] font-black uppercase tracking-[0.2em] text-amber-100/40">
            Next
          </div>
          <p className="mt-1 text-[10px] leading-5 text-slate-400">
            {explainer.next}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/6 px-4 py-2.5 font-mono text-[9px] text-slate-700">
          {detailSealedChunks !== null && detailSealedChunks !== undefined ? (
            <span>{detailSealedChunks} sealed chunks</span>
          ) : null}
          {detailProgressBasis ? <span>{detailProgressBasis}</span> : null}
          {proof ? <span>proof {proof}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      data-process-drilldown-kind="agent"
      className="mt-3 rounded-xl border border-white/8 bg-black/16 px-4 py-3 text-left"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
            System state
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-100">{system}</div>
        </div>
        <span className="rounded-full border border-white/8 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
          {status}
        </span>
      </div>

      <p className="mt-3 text-[10px] leading-5 text-slate-400">{summary}</p>

      {effectiveProgress !== null ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[9px] text-slate-600">
            <span>{progressLabel ?? "progress"}</span>
            <span>{effectiveProgress.toFixed(1)}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/7">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-300/80 to-emerald-300/80"
              style={{
                width:
                  Math.max(0, Math.min(100, effectiveProgress)) + "%",
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="mt-3 border-t border-white/6 pt-3">
        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
          What this means
        </div>
        <p className="mt-1 text-[10px] leading-5 text-slate-400">
          {explainer.what} {explainer.why}
        </p>
      </div>

      <div className="mt-3 border-t border-white/6 pt-3">
        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-100/40">
          Next
        </div>
        <p className="mt-1 text-[10px] leading-5 text-slate-400">
          {explainer.next}
        </p>
      </div>
    </div>
  );
}
