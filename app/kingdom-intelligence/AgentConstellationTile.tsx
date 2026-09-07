"use client";

import { useState } from "react";

type AgentConstellationTileProps = {
  label: string;
  state: string;
  summary: string;
  progress: number | null;
  progressLabel: string | null;
  active: boolean;
  beaconClass: string;
  statusToneClass: string;
};

export default function AgentConstellationTile({
  label,
  state,
  summary,
  progress,
  progressLabel,
  active,
  beaconClass,
  statusToneClass,
}: AgentConstellationTileProps) {
  const [focusedTheme, setFocusedTheme] = useState(false);

  const shellClass = focusedTheme
    ? "border-sky-200/30 bg-[radial-gradient(circle_at_12%_0%,rgba(125,211,252,0.12),transparent_30%),radial-gradient(circle_at_92%_100%,rgba(129,140,248,0.10),transparent_34%),linear-gradient(145deg,rgba(7,16,31,0.98),rgba(11,27,50,0.97))] shadow-[0_18px_48px_rgba(2,8,23,0.34),0_0_28px_rgba(56,189,248,0.07)]"
    : active
      ? "border-cyan-200/20 bg-[radial-gradient(circle_at_86%_14%,rgba(56,189,248,0.10),transparent_26%),linear-gradient(145deg,rgba(9,26,45,0.94),rgba(6,17,32,0.98)_58%,rgba(4,11,22,0.99))] shadow-[0_16px_42px_rgba(2,8,23,0.28),0_0_24px_rgba(56,189,248,0.045)]"
      : "border-white/8 bg-[linear-gradient(145deg,rgba(8,18,34,0.88),rgba(4,10,21,0.96))] shadow-[0_14px_34px_rgba(2,8,23,0.20)]";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={focusedTheme}
      aria-label={`${label} display tile. Click to change tile theme.`}
      title="Click to change tile theme"
      onClick={() => setFocusedTheme((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setFocusedTheme((value) => !value);
        }
      }}
      className={
        "group relative cursor-pointer overflow-hidden rounded-2xl border px-4 py-3 transition-all duration-300 hover:-translate-y-px hover:border-cyan-100/28 hover:shadow-[0_20px_46px_rgba(2,8,23,0.32),0_0_24px_rgba(56,189,248,0.055)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/35 " +
        shellClass
      }
    >
      <span className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/18 to-transparent" />
      <span
        className={
          "pointer-events-none absolute -right-10 top-1/2 h-24 w-28 -translate-y-1/2 rounded-full blur-3xl transition-opacity duration-300 " +
          (focusedTheme
            ? "bg-indigo-300/10 opacity-100"
            : active
              ? "bg-cyan-300/[0.07] opacity-100"
              : "bg-sky-300/[0.04] opacity-0 group-hover:opacity-100")
        }
      />

      <div className="relative z-10 flex items-start gap-3">
        <span className={"mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full " + beaconClass} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">{label}</div>
            <span
              className={
                "rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] " +
                statusToneClass
              }
            >
              {state}
            </span>
          </div>

          <div className="mt-1 text-xs leading-5 text-slate-400">{summary}</div>

          {progress !== null ? (
            <div className="mt-2">
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.055]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-300/80 via-sky-300/80 to-indigo-300/70"
                  style={{ width: Math.max(0, Math.min(100, progress)) + "%" }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9px] uppercase tracking-[0.15em] text-slate-600">
                <span>{progressLabel ?? "progress"}</span>
                <span>{progress.toFixed(progress % 1 === 0 ? 0 : 1)}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
