"use client";

import type { LeaderboardLane } from "@/lib/leaderboardLane";

type LeaderboardLaneToggleProps = {
  lane: LeaderboardLane;
  loading?: boolean;
  onChange: (lane: LeaderboardLane) => void;
  variant?: "card" | "compact";
  className?: string;
};

const LANE_LABELS: Record<LeaderboardLane, string> = {
  rm: "RM",
  dm: "DM",
};

export function LeaderboardLaneToggle({
  lane,
  loading = false,
  onChange,
  variant = "compact",
  className = "",
}: LeaderboardLaneToggleProps) {
  if (variant === "card") {
    const nextLane: LeaderboardLane = lane === "rm" ? "dm" : "rm";

    return (
      <button
        type="button"
        onClick={() => onChange(nextLane)}
        className={`w-full rounded-[1.25rem] border border-amber-200/18 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.13),transparent_48%),linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] px-4 py-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:border-amber-200/35 hover:bg-amber-300/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200/70 ${className}`}
        aria-busy={loading}
        aria-label={`Show the ${nextLane.toUpperCase()} ranked leaderboard`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/62">
            Ranked Ladder
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">
            {loading ? "Syncing" : "Live"}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 rounded-full border border-white/10 bg-black/30 p-1">
          {(["rm", "dm"] as const).map((laneOption) => (
            <span
              key={laneOption}
              className={`rounded-full px-3 py-2 text-center text-sm font-black tracking-[0.18em] transition ${
                lane === laneOption
                  ? "bg-amber-300 text-slate-950 shadow-[0_8px_24px_rgba(251,191,36,0.22)]"
                  : "text-slate-400"
              }`}
            >
              {LANE_LABELS[laneOption]}
            </span>
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-400">Your active war lane</div>
      </button>
    );
  }

  return (
    <div
      className={`inline-grid grid-cols-2 rounded-full border border-white/12 bg-slate-950/75 p-1 ${className}`}
      aria-label="Leaderboard ladder"
      aria-busy={loading}
    >
      {(["rm", "dm"] as const).map((nextLane) => (
        <button
          key={nextLane}
          type="button"
          onClick={() => onChange(nextLane)}
          aria-pressed={lane === nextLane}
          className={`rounded-full px-3 py-1.5 text-[10px] font-black tracking-[0.16em] transition ${
            lane === nextLane
              ? "bg-amber-300 text-slate-950"
              : "text-slate-400 hover:text-white"
          }`}
        >
          {LANE_LABELS[nextLane]}
        </button>
      ))}
    </div>
  );
}
