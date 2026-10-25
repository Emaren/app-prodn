"use client";

import { useState } from "react";

import ProcessDrilldown from "./ProcessDrilldown";
import { formatLiveRecoveryProgressLabel, useLiveRecoveryProgress, useRecoverySignalState } from "./useLiveRecoveryProgress";

type AgentRow = {
  key: string;
  label: string;
  state: string;
  summary: string;
  progress: number | null;
  progressLabel: string | null;
  activeSince: string | null;
  currentStep: string | null;
  etaSeconds: number | null;
  elapsedSeconds: number | null;
  sealedChunks: number | null;
  observedBytes: number | null;
  expectedBytes: number | null;
  throughputBytesPerSecond: number | null;
  progressBasis: string | null;
  beaconClass: string;
  statusToneClass: string;
};

type ThemeKey = "plain" | "sapphire" | "aurora";

const THEMES: ThemeKey[] = ["plain", "sapphire", "aurora"];

function rowShell(theme: ThemeKey) {
  if (theme === "sapphire") {
    return "border-sky-200/16 bg-[radial-gradient(circle_at_88%_10%,rgba(56,189,248,0.10),transparent_28%),linear-gradient(145deg,rgba(8,22,40,0.92),rgba(5,13,26,0.98))] shadow-[0_12px_34px_rgba(2,8,23,0.20)]";
  }

  if (theme === "aurora") {
    return "border-violet-200/15 bg-[radial-gradient(circle_at_12%_0%,rgba(167,139,250,0.10),transparent_30%),radial-gradient(circle_at_92%_100%,rgba(45,212,191,0.08),transparent_34%),linear-gradient(145deg,rgba(14,13,29,0.94),rgba(4,11,22,0.98))] shadow-[0_12px_34px_rgba(2,8,23,0.22)]";
  }

  return "border-white/8 bg-white/[0.025] hover:border-cyan-200/15 hover:bg-cyan-300/[0.025]";
}

function progressFill(theme: ThemeKey) {
  if (theme === "sapphire") {
    return "from-cyan-300/80 via-sky-300/80 to-indigo-300/70";
  }

  if (theme === "aurora") {
    return "from-violet-300/80 via-fuchsia-200/75 to-teal-300/80";
  }

  return "from-cyan-400/70 via-amber-300/80 to-emerald-300/85";
}

const PANEL_SHELL =
  "border-white/10 bg-[#071426] shadow-[0_24px_72px_rgba(2,8,23,0.18)]";

export default function AgentConstellationPanel({
  agents,
}: {
  agents: AgentRow[];
}) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const theme = THEMES[themeIndex] ?? "plain";
  const liveRecovery = useLiveRecoveryProgress(true);
  const recoverySignal = useRecoverySignalState();
  const recoveryNotice = recoverySignal === "operator_preview_only"
    ? "Live Recovery preview unavailable"
    : recoverySignal === "paused"
      ? "Live Recovery sampling paused"
      : recoverySignal === "unavailable"
        ? "Current Recovery sample unavailable"
        : recoverySignal === "live"
          ? "Live Recovery progress percentage unavailable"
          : "Awaiting a current Recovery sample";

  const cycleTheme = () => {
    setThemeIndex((current) => (current + 1) % THEMES.length);
  };

  return (
    <section
      aria-label="Agent constellation"
      data-agent-constellation-theme={theme}
      className={
        "group/constellation relative overflow-hidden rounded-[2rem] border p-5 transition-all duration-500 " +
        PANEL_SHELL
      }
    >
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.32em] text-amber-100/90">
            Agent constellation
          </div>
          <h2 className="mt-2 font-serif text-2xl text-[#f4e5bd]">
            Eight OS agents. One Doctor.
          </h2>
        </div>
        <button type="button" onClick={cycleTheme}
          aria-label={`Change Agent constellation display theme; current theme ${theme}`}
          className="shrink-0 rounded-lg border border-amber-200/20 px-2 py-1 text-xs text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-200">
          Change theme
        </button>
      </div>

      <div className="relative z-10 mt-3 space-y-2">
        {agents.map((agent) => {
          const expanded = expandedKey === agent.key;
          const recoveryItem = agent.key === "recovery";
          const recoveryLive =
            recoveryItem && liveRecovery?.available === true;
          const trustworthyLiveProgress =
            recoveryLive &&
            liveRecovery?.denominatorSource !== "unavailable" &&
            typeof liveRecovery?.overallPercent === "number"
              ? liveRecovery.overallPercent
              : null;
          const trustworthySnapshotProgress =
            recoveryItem &&
            typeof agent.progress === "number" &&
            typeof agent.expectedBytes === "number" &&
            agent.expectedBytes > 0 &&
            agent.progressBasis === "sealed + active encrypted chunk bytes"
              ? agent.progress
              : null;
          const effectiveProgress = recoveryItem
            ? trustworthyLiveProgress ?? trustworthySnapshotProgress
            : agent.progress;
          const effectiveProgressLabel = recoveryItem
            ? trustworthyLiveProgress !== null
              ? formatLiveRecoveryProgressLabel(
                  liveRecovery,
                  agent.progressLabel,
                )
              : trustworthySnapshotProgress !== null
                ? `Snapshot · ${agent.progressLabel ?? "previous progress"}`
                : recoveryNotice
            : agent.progressLabel;

          return (
          <div
            key={agent.key}
            className={
              "rounded-2xl border px-4 py-2.5 transition-all duration-500 " +
              rowShell(theme)
            }
          >
            <div className="flex items-start gap-3">
              <span
                className={
                  "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " +
                  agent.beaconClass
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">
                    {agent.label}
                  </div>
                  <span
                    className={
                      "rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] " +
                      agent.statusToneClass
                    }
                  >
                    {agent.state}
                  </span>
                  <button type="button" aria-expanded={expanded}
                    aria-label={`${expanded ? "Hide" : "Show"} ${agent.label} details`}
                    onClick={() => setExpandedKey((current) => current === agent.key ? null : agent.key)}
                    className="rounded-md border border-amber-200/20 px-2 py-0.5 text-[10px] text-amber-100 focus-visible:ring-2 focus-visible:ring-amber-200">
                    {expanded ? "Hide details" : "Details"}
                  </button>
                </div>

                <div className="mt-1 text-xs leading-5 text-slate-400">
                  {agent.summary}
                </div>

                {effectiveProgress !== null ? (
                  <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-white/6">
                      <div
                        className={
                          "h-full rounded-full bg-gradient-to-r " +
                          progressFill(theme)
                        }
                        style={{
                          width:
                            Math.max(0, Math.min(100, effectiveProgress)) + "%",
                        }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.15em] text-slate-300">
                      <span>{effectiveProgressLabel ?? "progress"}</span>
                      <span>
                        {effectiveProgress.toFixed(
                          recoveryLive || effectiveProgress % 1 !== 0 ? 1 : 0,
                        )}
                        %
                      </span>
                    </div>
                    {recoveryItem && trustworthyLiveProgress === null && trustworthySnapshotProgress !== null ? (
                      <div role="status" className="mt-1 text-[9px] uppercase tracking-[0.15em] text-slate-500">
                        {recoveryNotice}
                      </div>
                    ) : null}
                  </div>
                ) : recoveryItem ? (
                  <div className="mt-2">
                    <div role="status" className="mb-1 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                      Snapshot · historical status only; progress unverified
                    </div>
                    <div className="relative h-1 overflow-hidden rounded-full bg-white/6">
                      {recoverySignal === "awaiting_sample" ? (
                        <div className="absolute inset-y-0 left-0 w-1/3 animate-[pulse_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
                      ) : null}
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.15em] text-slate-300">
                      <span aria-live="polite">{recoveryNotice}</span>
                      <span>—</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {expanded ? (
              <div>
                <ProcessDrilldown
                  kind="agent"
                  systemKey={agent.key}
                  system={agent.label}
                  status={agent.state}
                  summary={agent.summary}
                  progress={effectiveProgress}
                  progressLabel={effectiveProgressLabel}
                  startedAt={agent.activeSince}
                  current={agent.state === "ACTIVE"}
                  currentStep={agent.currentStep}
                  etaSeconds={agent.etaSeconds}
                  elapsedSeconds={agent.elapsedSeconds}
                  sealedChunks={agent.sealedChunks}
                  observedBytes={agent.observedBytes}
                  expectedBytes={agent.expectedBytes}
                  throughputBytesPerSecond={
                    agent.throughputBytesPerSecond
                  }
                  progressBasis={agent.progressBasis}
                  liveRecovery={recoveryLive ? liveRecovery : null}
                />
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      <div className="relative z-10 mt-3 border-t border-white/6 pt-3 text-[10px] leading-4 text-slate-300">
        Beacon law: cyan pulse = working · green solid = healthy/closed · amber pulse = waiting/attention · red = failed/blocked · slate = idle.
      </div>
    </section>
  );
}
