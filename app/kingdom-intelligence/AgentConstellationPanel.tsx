"use client";

import { useState } from "react";

import ProcessDrilldown from "./ProcessDrilldown";
import { useLiveRecoveryProgress } from "./useLiveRecoveryProgress";

type AgentRow = {
  key: string;
  label: string;
  state: string;
  summary: string;
  progress: number | null;
  progressLabel: string | null;
  activeSince: string | null;
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
  "border-amber-100/10 bg-[radial-gradient(circle_at_20%_0%,rgba(245,158,11,.08),transparent_32%),rgba(2,6,23,.82)]";

export default function AgentConstellationPanel({
  agents,
}: {
  agents: AgentRow[];
}) {
  const [themeIndex, setThemeIndex] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const theme = THEMES[themeIndex] ?? "plain";
  const liveRecovery = useLiveRecoveryProgress(true);

  const cycleTheme = () => {
    setThemeIndex((current) => (current + 1) % THEMES.length);
  };

  return (
    <section
      role="button"
      tabIndex={0}
      data-agent-constellation-theme={theme}
      aria-label={`Agent constellation display tile. Current theme: ${theme}.`}
      onClick={cycleTheme}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cycleTheme();
        }
      }}
      className={
        "group/constellation relative cursor-pointer overflow-hidden rounded-[2rem] border p-5 transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/35 sm:p-6 " +
        PANEL_SHELL
      }
    >
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.32em] text-amber-100/45">
            Agent constellation
          </div>
          <h2 className="mt-2 font-serif text-2xl text-[#f4e5bd]">
            Eight OS agents. One Doctor.
          </h2>
        </div>
      </div>

      <div className="relative z-10 mt-4 space-y-2.5">
        {agents.map((agent) => {
          const expanded = expandedKey === agent.key;
          const recoveryLive =
            agent.key === "recovery" && liveRecovery?.available === true;
          const liveProgress =
            recoveryLive &&
            typeof liveRecovery?.overallPercent === "number"
              ? liveRecovery.overallPercent
              : null;
          const effectiveProgress = liveProgress ?? agent.progress;

          return (
          <div
            key={agent.key}
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              setExpandedKey((current) =>
                current === agent.key ? null : agent.key,
              );
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                setExpandedKey((current) =>
                  current === agent.key ? null : agent.key,
                );
              }
            }}
            className={
              "cursor-pointer rounded-2xl border px-4 py-3 transition-all duration-500 " +
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
                    <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.15em] text-slate-600">
                      <span>{agent.progressLabel ?? "progress"}</span>
                      <span>
                        {effectiveProgress.toFixed(
                          recoveryLive || effectiveProgress % 1 !== 0 ? 1 : 0,
                        )}
                        %
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {expanded ? (
              <div
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <ProcessDrilldown
                  systemKey={agent.key}
                  system={agent.label}
                  status={agent.state}
                  summary={agent.summary}
                  progress={effectiveProgress}
                  progressLabel={agent.progressLabel}
                  startedAt={agent.activeSince}
                  current={agent.state === "ACTIVE"}
                  liveRecovery={recoveryLive ? liveRecovery : null}
                />
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      <div className="relative z-10 mt-4 border-t border-white/6 pt-4 text-[11px] leading-5 text-slate-600">
        Beacon law: cyan pulse = working · green solid = healthy/closed · amber pulse = waiting/attention · red = failed/blocked · slate = idle.
      </div>
    </section>
  );
}
