"use client";

import { Bot, Radio } from "lucide-react";
import { useState } from "react";

import BrowserLocalTime from "./BrowserLocalTime";

type WarPulseItem = {
  key: string;
  at: string;
  system: string;
  label: string;
  status: string;
  proof: string | null;
  current: boolean;
  progress: number | null;
  progressLabel: string | null;
  beaconClass: string;
  statusToneClass: string;
};

type ThemeKey = "plain" | "signal" | "cosmic";

const THEMES: ThemeKey[] = ["plain", "signal", "cosmic"];

function panelShell(theme: ThemeKey) {
  if (theme === "signal") {
    return "border-cyan-200/14 bg-[linear-gradient(118deg,rgba(2,6,12,0.99),rgba(8,47,73,0.30),rgba(120,53,15,0.18),rgba(6,78,59,0.18),rgba(2,6,12,0.99))] shadow-[0_24px_90px_rgba(0,0,0,.30),0_0_34px_rgba(34,211,238,0.045)]";
  }

  if (theme === "cosmic") {
    return "border-violet-200/16 bg-[radial-gradient(circle_at_16%_8%,rgba(34,211,238,0.10),transparent_26%),radial-gradient(circle_at_84%_14%,rgba(139,92,246,0.14),transparent_28%),radial-gradient(circle_at_72%_86%,rgba(236,72,153,0.08),transparent_30%),linear-gradient(145deg,rgba(2,5,12,0.99),rgba(8,11,28,0.99)_56%,rgba(2,6,16,0.99))] shadow-[0_24px_100px_rgba(0,0,0,.34),0_0_42px_rgba(124,58,237,0.06)]";
  }

  return "border-cyan-200/10 bg-[#02060c] shadow-[0_24px_90px_rgba(0,0,0,.28)]";
}

function rowShell(theme: ThemeKey, current: boolean) {
  if (theme === "signal") {
    return current
      ? "my-1 overflow-hidden rounded-xl border border-cyan-200/20 bg-[linear-gradient(115deg,rgba(8,47,73,0.42),rgba(15,23,42,0.24),rgba(120,53,15,0.30),rgba(6,78,59,0.28),rgba(8,47,73,0.42))] px-3 shadow-[0_0_34px_rgba(34,211,238,0.08)]"
      : "border-b border-white/[0.05] bg-black/[0.06] last:border-0";
  }

  if (theme === "cosmic") {
    return current
      ? "my-1 overflow-hidden rounded-xl border border-violet-200/22 bg-[radial-gradient(circle_at_10%_50%,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_88%_44%,rgba(139,92,246,0.16),transparent_34%),linear-gradient(115deg,rgba(4,12,24,0.94),rgba(14,13,35,0.94),rgba(8,19,35,0.94))] px-3 shadow-[0_0_38px_rgba(139,92,246,0.10)]"
      : "border-b border-violet-100/[0.06] bg-violet-300/[0.015] last:border-0";
  }

  return current
    ? "my-1 rounded-xl border border-cyan-200/12 bg-white/[0.018] px-3"
    : "border-b border-white/[0.045] last:border-0";
}

function progressFill(theme: ThemeKey) {
  if (theme === "cosmic") {
    return "from-cyan-300 via-violet-300 to-fuchsia-300";
  }

  return "from-cyan-300 via-amber-200 to-emerald-300";
}

export default function WarPulsePanel({
  activeSystemCount,
  items,
}: {
  activeSystemCount: number;
  items: WarPulseItem[];
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
      data-war-pulse-theme={theme}
      aria-label={`War Pulse display tile. Current theme: ${theme}. Click to change theme.`}
      title="Click to change War Pulse theme"
      onClick={cycleTheme}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          cycleTheme();
        }
      }}
      className={
        "group/warpulse relative cursor-pointer overflow-hidden rounded-[2rem] border transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/35 " +
        panelShell(theme)
      }
    >
      {theme !== "plain" ? (
        <>
          <span
            className={
              "pointer-events-none absolute -left-20 top-28 h-40 w-44 rounded-full blur-3xl transition-opacity duration-500 " +
              (theme === "signal"
                ? "bg-cyan-300/[0.055]"
                : "bg-cyan-300/[0.075]")
            }
          />
          <span
            className={
              "pointer-events-none absolute -right-20 top-40 h-44 w-48 rounded-full blur-3xl transition-opacity duration-500 " +
              (theme === "signal"
                ? "bg-amber-300/[0.045]"
                : "bg-violet-300/[0.08]")
            }
          />
        </>
      ) : null}

      <div className="relative z-10 flex items-center justify-between border-b border-white/7 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-200/10 bg-cyan-300/[0.05]">
            <Radio className="h-4 w-4 text-cyan-200/80" />
            <span
              className={
                "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full " +
                (activeSystemCount
                  ? "bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,.8)] animate-pulse"
                  : "bg-slate-600")
              }
            />
          </div>
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-100/45">
              War Pulse · live chronicle
            </div>
            <h2 className="mt-1 font-serif text-2xl text-white">
              The nervous system speaks.
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="hidden text-[9px] font-black uppercase tracking-[0.18em] text-slate-700 opacity-0 transition-opacity duration-200 group-hover/warpulse:opacity-100 sm:block"
          >
            click to change
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-600">
            polls every 20s
          </div>
        </div>
      </div>

      <div className="relative z-10 max-h-[34rem] overflow-y-auto px-4 py-3 font-mono text-xs sm:px-5">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.key}
              className={
                "relative grid grid-cols-[9px_62px_minmax(0,1fr)] gap-3 py-3 transition-all duration-500 " +
                rowShell(theme, item.current)
              }
            >
              {item.current && theme !== "plain" ? (
                <>
                  <span
                    className={
                      "pointer-events-none absolute -left-14 top-1/2 h-20 w-32 -translate-y-1/2 rounded-full blur-2xl " +
                      (theme === "signal"
                        ? "bg-cyan-300/12 animate-[pulse_4.5s_ease-in-out_infinite]"
                        : "bg-cyan-300/10 animate-[pulse_5.2s_ease-in-out_infinite]")
                    }
                  />
                  <span
                    className={
                      "pointer-events-none absolute -right-10 top-1/2 h-24 w-36 -translate-y-1/2 rounded-full blur-3xl " +
                      (theme === "signal"
                        ? "bg-amber-300/10 animate-[pulse_6.5s_ease-in-out_infinite]"
                        : "bg-violet-300/12 animate-[pulse_7.2s_ease-in-out_infinite]")
                    }
                  />
                </>
              ) : null}

              <span
                className={
                  "relative z-10 mt-1 h-2 w-2 rounded-full " +
                  item.beaconClass
                }
              />
              <span
                className={
                  (item.current
                    ? "font-semibold text-cyan-100/70"
                    : "text-slate-600") + " relative z-10"
                }
              >
                <BrowserLocalTime value={item.at} />
              </span>

              <div className="relative z-10 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-cyan-100/80">
                    {item.system}
                  </span>
                  {item.current ? (
                    <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100">
                      Live process
                    </span>
                  ) : null}
                  <span
                    className={
                      item.statusToneClass +
                      " rounded-full border px-1.5 py-0.5 text-[8px] font-black tracking-[0.14em]"
                    }
                  >
                    {item.status}
                  </span>
                </div>

                <div
                  className={
                    "mt-1 " +
                    (item.current
                      ? "font-semibold text-slate-100"
                      : "truncate text-slate-300")
                  }
                >
                  {item.label}
                </div>

                {item.current && item.progress !== null ? (
                  <div className="mt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-white/8">
                      <div
                        className={
                          "h-full rounded-full bg-gradient-to-r " +
                          progressFill(theme)
                        }
                        style={{
                          width:
                            Math.max(0, Math.min(100, item.progress)) + "%",
                        }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-[9px] uppercase tracking-[0.14em] text-cyan-100/45">
                      <span>{item.progressLabel ?? "process progress"}</span>
                      <span>
                        {item.progress.toFixed(
                          item.progress % 1 === 0 ? 0 : 1,
                        )}
                        %
                      </span>
                    </div>
                  </div>
                ) : null}

                {item.proof ? (
                  <div className="mt-1 text-[10px] text-slate-700">
                    proof {item.proof}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center text-center text-slate-600">
            <Bot className="mb-3 h-7 w-7" />
            <div>No proven activity line is available yet.</div>
            <div className="mt-2 max-w-md text-[11px] leading-5 text-slate-700">
              Kingdom Intelligence does not invent an agent heartbeat. Registered
              work, OS receipts and sealed source events appear here when
              evidence exists.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
