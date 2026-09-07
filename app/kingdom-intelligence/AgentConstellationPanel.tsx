"use client";

import { useState } from "react";

type AgentRow = {
  key: string;
  label: string;
  state: string;
  summary: string;
  progress: number | null;
  progressLabel: string | null;
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

function panelShell(theme: ThemeKey) {
  if (theme === "sapphire") {
    return "border-sky-200/16 bg-[radial-gradient(circle_at_86%_4%,rgba(56,189,248,0.08),transparent_30%),linear-gradient(160deg,rgba(7,18,34,0.94),rgba(3,9,19,0.98))] shadow-[0_24px_72px_rgba(2,8,23,0.24)]";
  }

  if (theme === "aurora") {
    return "border-violet-200/14 bg-[radial-gradient(circle_at_14%_0%,rgba(139,92,246,0.10),transparent_30%),radial-gradient(circle_at_94%_86%,rgba(20,184,166,0.07),transparent_34%),linear-gradient(155deg,rgba(13,11,25,0.96),rgba(3,8,18,0.99))] shadow-[0_24px_72px_rgba(2,8,23,0.26)]";
  }

  return "border-amber-100/10 bg-[radial-gradient(circle_at_20%_0%,rgba(245,158,11,.08),transparent_32%),rgba(2,6,23,.82)]";
}

export default function AgentConstellationPanel({
  agents,
}: {
  agents: AgentRow[];
}) {
  const [themeIndex, setThemeIndex] = useState(0);
  const theme = THEMES[themeIndex] ?? "plain";

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
        panelShell(theme)
      }
    >
      {theme !== "plain" ? (
        <span
          className={
            "pointer-events-none absolute -right-20 top-24 h-44 w-44 rounded-full blur-3xl transition-opacity duration-500 " +
            (theme === "sapphire"
              ? "bg-cyan-300/[0.055]"
              : "bg-violet-300/[0.06]")
          }
        />
      ) : null}

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
        {agents.map((agent) => (
          <div
            key={agent.key}
            className={
              "rounded-2xl border px-4 py-3 transition-all duration-500 " +
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

                {agent.progress !== null ? (
                  <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-white/6">
                      <div
                        className={
                          "h-full rounded-full bg-gradient-to-r " +
                          progressFill(theme)
                        }
                        style={{
                          width:
                            Math.max(0, Math.min(100, agent.progress)) + "%",
                        }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.15em] text-slate-600">
                      <span>{agent.progressLabel ?? "progress"}</span>
                      <span>
                        {agent.progress.toFixed(
                          agent.progress % 1 === 0 ? 0 : 1,
                        )}
                        %
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative z-10 mt-4 border-t border-white/6 pt-4 text-[11px] leading-5 text-slate-600">
        Beacon law: cyan pulse = working · green solid = healthy/closed · amber pulse = waiting/attention · red = failed/blocked · slate = idle.
      </div>
    </section>
  );
}
