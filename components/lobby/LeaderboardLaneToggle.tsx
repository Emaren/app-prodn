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

const LANE_COPY: Record<
  LeaderboardLane,
  {
    short: string;
    eyebrow: string;
    name: string;
    sigil: string;
    rail: string;
    aura: string;
    text: string;
  }
> = {
  rm: {
    short: "RM",
    eyebrow: "Ranked",
    name: "Empire War",
    sigil: "♜",
    rail: "from-cyan-200/90 via-sky-300/70 to-white/80",
    aura: "shadow-[0_0_42px_rgba(125,211,252,0.20)]",
    text: "text-cyan-950",
  },
  dm: {
    short: "DM",
    eyebrow: "Death",
    name: "Sudden War",
    sigil: "⚔",
    rail: "from-amber-200 via-yellow-300 to-orange-400",
    aura: "shadow-[0_0_48px_rgba(250,204,21,0.28)]",
    text: "text-zinc-950",
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
  const active = LANE_COPY[currentLane];
  const isDm = currentLane === "dm";
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
        "group relative isolate overflow-hidden border border-white/[0.14] bg-[#050812]/92 p-[1px]",
        isCompact ? "rounded-[1.2rem]" : "rounded-[1.65rem]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_22px_70px_rgba(0,0,0,0.46)]",
        "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_18%_0%,rgba(255,215,106,0.18),transparent_32%),radial-gradient(circle_at_82%_100%,rgba(59,130,246,0.18),transparent_34%)]",
        "after:absolute after:inset-x-10 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/55 after:to-transparent",
        isBusy && "opacity-60",
        className,
      )}
      aria-label="Ranked ladder war lane"
    >
      <div className={cx(
        "relative bg-gradient-to-b from-white/[0.075] via-white/[0.028] to-black/35",
        isCompact ? "rounded-[1.13rem] p-1.5" : "rounded-[1.58rem] p-2",
      )}>
        <div className="pointer-events-none absolute inset-2 rounded-[1.24rem] border border-white/[0.07]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.055)_44%,transparent_56%)] opacity-0 transition duration-700 group-hover:translate-x-8 group-hover:opacity-100" />

        <div className="relative grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isBusy}
            aria-pressed={!isDm}
            onClick={() => chooseLane("rm")}
            className={cx(
              cx(
                "relative overflow-hidden rounded-[1.16rem] text-left transition duration-300",
                isCompact ? "min-h-[3.75rem] px-3 py-2.5" : "min-h-[4.45rem] px-4 py-3",
              ),
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/65 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050812]",
              !isDm ? "text-cyan-950" : "text-slate-400 hover:bg-white/[0.055] hover:text-white",
            )}
          >
            {!isDm && <ActiveLaneSkin meta={LANE_COPY.rm} side="left" />}
            <LaneInner meta={LANE_COPY.rm} active={!isDm} />
          </button>

          <button
            type="button"
            disabled={isBusy}
            aria-pressed={isDm}
            onClick={() => chooseLane("dm")}
            className={cx(
              cx(
                "relative overflow-hidden rounded-[1.16rem] text-left transition duration-300",
                isCompact ? "min-h-[3.75rem] px-3 py-2.5" : "min-h-[4.45rem] px-4 py-3",
              ),
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050812]",
              isDm ? "text-zinc-950" : "text-slate-400 hover:bg-white/[0.055] hover:text-white",
            )}
          >
            {isDm && <ActiveLaneSkin meta={LANE_COPY.dm} side="right" />}
            <LaneInner meta={LANE_COPY.dm} active={isDm} />
          </button>
        </div>

        <div className="relative mt-2 flex items-center justify-between gap-3 px-2 pb-1">
          <span className="text-[0.56rem] font-black uppercase tracking-[0.34em] text-slate-500">
            Active war lane
          </span>
          <span
            className={cx(
              "rounded-full border px-2.5 py-1 text-[0.56rem] font-black uppercase tracking-[0.24em]",
              isDm
                ? "border-yellow-200/25 bg-yellow-300/10 text-yellow-100/80"
                : "border-cyan-200/20 bg-cyan-300/10 text-cyan-100/80",
            )}
          >
            {loading ? "Summoning…" : active.name}
          </span>
        </div>
      </div>
    </section>
  );
}

function ActiveLaneSkin({
  meta,
  side,
}: {
  meta: (typeof LANE_COPY)[LeaderboardLane];
  side: "left" | "right";
}) {
  return (
    <>
      <span
        className={cx(
          "absolute inset-0 rounded-[1.16rem] bg-gradient-to-br opacity-95",
          meta.rail,
          meta.aura,
        )}
      />
      <span className="absolute inset-[1px] rounded-[1.1rem] bg-[linear-gradient(145deg,rgba(255,255,255,0.28),rgba(255,255,255,0.07)_34%,rgba(0,0,0,0.30)_100%)]" />
      <span
        className={cx(
          "absolute top-0 h-full w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-sm transition duration-700 group-hover:translate-x-10",
          side === "left" ? "-left-8" : "left-4",
        )}
      />
      <span className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/85 to-transparent" />
      <span className="absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-black/45 to-transparent" />
    </>
  );
}

function LaneInner({
  meta,
  active,
}: {
  meta: (typeof LANE_COPY)[LeaderboardLane];
  active: boolean;
}) {
  return (
    <span className="relative flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span
          className={cx(
            "block text-[0.55rem] font-black uppercase tracking-[0.36em] transition",
            active ? "text-black/55" : "text-slate-500",
          )}
        >
          {meta.eyebrow}
        </span>
        <span
          className={cx(
            "mt-1 block font-serif text-[2.05rem] font-black leading-none tracking-[0.24em] transition",
            active ? "text-black drop-shadow-[0_1px_0_rgba(255,255,255,0.36)]" : "text-slate-100/86",
          )}
        >
          {meta.short}
        </span>
        <span
          className={cx(
            "mt-1 block truncate text-[0.58rem] font-black uppercase tracking-[0.18em]",
            active ? "text-black/58" : "text-slate-500",
          )}
        >
          {meta.name}
        </span>
      </span>

      <span
        className={cx(
          "grid h-9 w-9 place-items-center rounded-full border font-serif text-base font-black transition",
          active
            ? "border-black/20 bg-black/10 text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
            : "border-white/10 bg-white/[0.035] text-slate-500",
        )}
        aria-hidden="true"
      >
        {active ? meta.sigil : "·"}
      </span>
    </span>
  );
}

export { LeaderboardLaneToggle };
