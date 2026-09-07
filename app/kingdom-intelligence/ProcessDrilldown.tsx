"use client";

import { useEffect, useMemo, useState } from "react";

import type { LiveRecoveryProgress } from "./useLiveRecoveryProgress";

type Props = {
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
      "Recovery OS makes encrypted survival copies of important AoE2WAR data that GitHub alone cannot restore.",
    why:
      "If a server or storage volume dies, this is what lets the kingdom rebuild instead of starting from zero.",
    next:
      "Seal the current recovery class, verify that it can be read back safely, then move to the next authorized class.",
  },
  release: {
    what:
      "Release OS keeps GitHub, the deployed site, and the certified build lined up.",
    why:
      "It prevents the live site from quietly drifting away from the code we think is running.",
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
      "Storage OS watches disk capacity, retained generations, and the health of the storage estate.",
    why:
      "Healthy free space keeps captures, builds, databases, and backups from colliding with a full disk.",
    next:
      "Reclaim or rotate storage when thresholds say maintenance is due.",
  },
  replay_truth: {
    what:
      "Replay Truth OS works out what the replay evidence can prove about games, teams, and winners.",
    why:
      "The site should never invent a winner just because the answer would be convenient.",
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
      "Host OS watches the server itself: updates, reboot requirements, service health, and basic machine hygiene.",
    why:
      "A perfect application still fails if the machine underneath it is unhealthy.",
    next:
      "Apply safe maintenance when the release and recovery windows allow it.",
  },
  doctor: {
    what:
      "System Doctor combines health evidence from the whole estate into a simple operating score.",
    why:
      "It gives us one quick answer to whether something important needs attention.",
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

export default function ProcessDrilldown({
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
        ? "Let the active work finish, then seal or verify its result."
        : "Watch the next state change or open the related system when deeper evidence becomes available.",
  };

  const liveRecoveryActive =
    key === "recovery" && liveRecovery?.available === true;

  const liveProgress =
    liveRecoveryActive && typeof liveRecovery?.overallPercent === "number"
      ? liveRecovery.overallPercent
      : null;
  const effectiveProgress = liveProgress ?? progress;

  const startedMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const elapsedSeconds = Number.isFinite(startedMs)
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

  const progressCopy = useMemo(() => {
    if (effectiveProgress === null) return "No percentage is proven yet.";
    if (liveRecoveryActive) {
      return "Estimated from sealed and active Recovery chunk bytes. The remote source-size estimate is cached, so the 5-second browser poll stays light.";
    }
    if (detailProgressBasis) {
      return `Measured from ${detailProgressBasis}.`;
    }
    return "This percentage comes from the latest Kingdom Intelligence snapshot.";
  }, [effectiveProgress, liveRecoveryActive, detailProgressBasis]);

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 text-left">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-white/6 bg-white/[0.025] p-3">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
            What this is
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-300">
            {explainer.what}
          </p>
        </div>

        <div className="rounded-lg border border-white/6 bg-white/[0.025] p-3">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
            Why it matters
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-300">
            {explainer.why}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-white/6 bg-white/[0.02] p-2.5">
          <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
            Status
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-200">{status}</div>
        </div>

        <div className="rounded-lg border border-white/6 bg-white/[0.02] p-2.5">
          <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
            Progress
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-200">
            {effectiveProgress === null
              ? "—"
              : `${effectiveProgress.toFixed(1)}%`}
          </div>
        </div>

        <div className="rounded-lg border border-white/6 bg-white/[0.02] p-2.5">
          <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
            Elapsed
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-200">
            {friendlyDuration(elapsedSeconds)}
          </div>
        </div>

        <div className="rounded-lg border border-white/6 bg-white/[0.02] p-2.5">
          <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
            ETA
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-200">
            {etaSeconds !== null ? friendlyDuration(etaSeconds) : "Learning…"}
          </div>
        </div>
      </div>

      {detailCurrentStep ||
      detailSealedChunks != null ||
      detailObservedBytes != null ||
      detailThroughput != null ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-cyan-200/8 bg-cyan-300/[0.025] p-2.5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
              Current step
            </div>
            <div className="mt-1 text-[11px] font-semibold text-cyan-100/80">
              {detailCurrentStep ?? "Active process"}
            </div>
          </div>

          <div className="rounded-lg border border-cyan-200/8 bg-cyan-300/[0.025] p-2.5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
              Sealed chunks
            </div>
            <div className="mt-1 text-[11px] font-semibold text-cyan-100/80">
              {detailSealedChunks ?? "—"}
            </div>
          </div>

          <div className="rounded-lg border border-cyan-200/8 bg-cyan-300/[0.025] p-2.5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
              Captured
            </div>
            <div className="mt-1 text-[11px] font-semibold text-cyan-100/80">
              {friendlyBytes(detailObservedBytes)}
            </div>
          </div>

          <div className="rounded-lg border border-cyan-200/8 bg-cyan-300/[0.025] p-2.5">
            <div className="text-[8px] uppercase tracking-[0.18em] text-slate-600">
              Current pace
            </div>
            <div className="mt-1 text-[11px] font-semibold text-cyan-100/80">
              {friendlyRate(detailThroughput)}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border border-white/6 bg-white/[0.018] p-3">
        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
          Current evidence
        </div>
        <p className="mt-1 text-[11px] leading-5 text-slate-300">{summary}</p>
        <p className="mt-2 text-[10px] leading-4 text-slate-600">
          {progressLabel ? `${progressLabel} · ` : ""}
          {progressCopy}
        </p>
        {detailExpectedBytes !== null && detailExpectedBytes !== undefined ? (
          <p className="mt-1 text-[10px] leading-4 text-slate-700">
            expected {friendlyBytes(detailExpectedBytes)}
          </p>
        ) : null}
        {proof ? (
          <p className="mt-1 font-mono text-[9px] text-slate-700">
            proof {proof}
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-lg border border-amber-100/8 bg-amber-200/[0.025] p-3">
        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-amber-100/45">
          What happens next
        </div>
        <p className="mt-1 text-[11px] leading-5 text-slate-300">
          {explainer.next}
        </p>
      </div>
    </div>
  );
}
