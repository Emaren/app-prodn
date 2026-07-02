"use client";

import type { LeaderboardLane } from "@/lib/leaderboardLane";

type LeaderboardLaneToggleProps = {
  lane?: LeaderboardLane;
  value?: LeaderboardLane;
  activeLane?: LeaderboardLane;
  selectedLane?: LeaderboardLane;
  onChange?: (lane: LeaderboardLane) => void;
  onLaneChange?: (lane: LeaderboardLane) => void;
  onSelectLane?: (lane: LeaderboardLane) => void;
  setLane?: (lane: LeaderboardLane) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: string;
  className?: string;
};

const LANES: Record<
  LeaderboardLane,
  {
    short: string;
    eyebrow: string;
    sigil: string;
    activeText: string;
    idleText: string;
    activeBorder: string;
    activeGlow: string;
    activeLine: string;
    focusRing: string;
  }
> = {
  rm: {
    short: "RM",
    eyebrow: "Ranked",
    sigil: "♜",
    activeText: "text-cyan-100",
    idleText: "text-slate-400",
    activeBorder: "border-cyan-200/28",
    activeGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_0_34px_rgba(103,232,249,0.13)]",
    activeLine: "from-transparent via-cyan-200/70 to-transparent",
    focusRing: "focus-visible:ring-cyan-200/55",
  },
  dm: {
    short: "DM",
    eyebrow: "Death",
    sigil: "⚔",
    activeText: "text-yellow-100",
    idleText: "text-slate-400",
    activeBorder: "border-yellow-200/28",
    activeGlow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_0_38px_rgba(250,204,21,0.15)]",
    activeLine: "from-transparent via-yellow-200/75 to-transparent",
    focusRing: "focus-visible:ring-yellow-200/60",
  },
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeLane(value: unknown): LeaderboardLane {
  return value === "dm" ? "dm" : "rm";
}

export default function LeaderboardLaneToggle({
  lane,
  value,
  activeLane,
  selectedLane,
  onChange,
  onLaneChange,
  onSelectLane,
  setLane,
  disabled = false,
  loading = false,
  variant = "card",
  className,
}: LeaderboardLaneToggleProps) {
  const currentLane = normalizeLane(lane ?? value ?? activeLane ?? selectedLane);
  const isBusy = disabled || loading;
  const isCompact = variant === "compact" || variant === "inline";

  const chooseLane = (nextLane: LeaderboardLane) => {
    if (isBusy || nextLane === currentLane) return;

    onChange?.(nextLane);
    onLaneChange?.(nextLane);
    onSelectLane?.(nextLane);
    setLane?.(nextLane);
  };

  return (
    <section
      className={cx(
        "group relative isolate overflow-hidden border border-white/[0.13] bg-[#030610]/94 p-[1px]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.09),0_22px_70px_rgba(0,0,0,0.48)]",
        "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_18%_0%,rgba(255,215,106,0.07),transparent_34%),radial-gradient(circle_at_82%_100%,rgba(59,130,246,0.08),transparent_36%)]",
        "after:absolute after:inset-x-10 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/34 after:to-transparent",
        isCompact ? "rounded-[1.18rem]" : "rounded-[1.55rem]",
        isBusy && "opacity-60",
        className,
      )}
      aria-label="Ranked ladder lane"
    >
      <div
        className={cx(
          "relative bg-gradient-to-b from-white/[0.065] via-white/[0.022] to-black/40",
          isCompact ? "rounded-[1.1rem] p-1.5" : "rounded-[1.48rem] p-2",
        )}
      >
        <div className="pointer-events-none absolute inset-2 rounded-[1.05rem] border border-white/[0.055]" />
        <div className="relative grid grid-cols-2 gap-2">
          <LaneButton
            meta={LANES.rm}
            active={currentLane === "rm"}
            compact={isCompact}
            disabled={isBusy}
            onClick={() => chooseLane("rm")}
          />

          <LaneButton
            meta={LANES.dm}
            active={currentLane === "dm"}
            compact={isCompact}
            disabled={isBusy}
            onClick={() => chooseLane("dm")}
          />
        </div>
      </div>
    </section>
  );
}

function LaneButton({
  meta,
  active,
  compact,
  disabled,
  onClick,
}: {
  meta: (typeof LANES)[LeaderboardLane];
  active: boolean;
  compact: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "relative overflow-hidden rounded-[1rem] border text-left transition duration-300",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#030610]",
        meta.focusRing,
        compact ? "min-h-[3.45rem] px-3 py-2.5" : "min-h-[4.15rem] px-4 py-3",
        active
          ? cx(
              "border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.105),rgba(255,255,255,0.035)_36%,rgba(0,0,0,0.36)_100%)]",
              meta.activeBorder,
              meta.activeGlow,
            )
          : "border-white/[0.075] bg-black/18 text-slate-500 hover:border-white/14 hover:bg-white/[0.045]",
      )}
    >
      {active && (
        <>
          <span className="absolute inset-0 rounded-[1rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.105),transparent_42%)]" />
          <span className={cx("absolute inset-x-5 top-0 h-px bg-gradient-to-r", meta.activeLine)} />
          <span className={cx("absolute inset-x-7 bottom-0 h-px bg-gradient-to-r opacity-70", meta.activeLine)} />
        </>
      )}

      <span className="relative flex items-center justify-between gap-3">
        <span>
          <span
            className={cx(
              "block text-[0.55rem] font-black uppercase tracking-[0.36em]",
              active ? "text-white/45" : "text-slate-600",
            )}
          >
            {meta.eyebrow}
          </span>
          <span
            className={cx(
              "mt-1 block font-serif font-black leading-none tracking-[0.26em]",
              compact ? "text-[1.65rem]" : "text-[2rem]",
              active ? meta.activeText : meta.idleText,
            )}
          >
            {meta.short}
          </span>
        </span>

        <span
          className={cx(
            "grid place-items-center rounded-full border font-serif font-black transition",
            compact ? "h-8 w-8 text-sm" : "h-9 w-9 text-base",
            active
              ? "border-white/16 bg-black/24 text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
              : "border-white/[0.08] bg-white/[0.025] text-slate-600",
          )}
          aria-hidden="true"
        >
          {active ? meta.sigil : "·"}
        </span>
      </span>
    </button>
  );
}

export { LeaderboardLaneToggle };
