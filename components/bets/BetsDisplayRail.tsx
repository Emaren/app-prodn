"use client";

import {
  Layers3,
  Monitor,
} from "lucide-react";

import {
  BETS_VIEW_VERSIONS,
  type BetsViewVersion,
} from "@/lib/betsViewVersions";

export default function BetsDisplayRail({
  value,
  onChange,
  battleCamOpen,
  onBattleCamToggle,
}: {
  value: BetsViewVersion;
  onChange: (
    next: BetsViewVersion,
  ) => void;
  battleCamOpen: boolean;
  onBattleCamToggle: () => void;
}) {
  return (
    <section
      data-testid="bets-display-rail"
      aria-label="Betting Hall display controls"
      className="
        sticky bottom-3 z-40 mt-6
        flex min-h-12 w-full
        items-center justify-end gap-2
        rounded-2xl border border-white/[0.08]
        bg-[linear-gradient(90deg,rgba(7,16,31,0.72),rgba(5,11,22,0.90))]
        px-2 py-1.5
        shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_16px_48px_rgba(0,0,0,0.28)]
        backdrop-blur-xl
      "
    >
      <button
        type="button"
        aria-pressed={battleCamOpen}
        aria-label={
          battleCamOpen
            ? "Close Battle Cam"
            : "Open Battle Cam"
        }
        title={
          battleCamOpen
            ? "Close Battle Cam"
            : "Open Battle Cam"
        }
        onClick={onBattleCamToggle}
        className={`
          grid h-9 w-9 place-items-center
          rounded-full transition
          ${
            battleCamOpen
              ? "bg-cyan-300/[0.10] text-cyan-100 ring-1 ring-cyan-200/20"
              : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
          }
        `}
      >
        <Monitor
          className="h-4 w-4"
          aria-hidden="true"
        />
      </button>

      <span
        className="h-6 w-px bg-white/[0.08]"
        aria-hidden="true"
      />

      <div className="group relative">
        <button
          type="button"
          aria-label={`Choose Betting Hall view. Current ${value}`}
          title={`View ${value}`}
          className="
            grid h-9 w-9 place-items-center
            rounded-full text-slate-500
            transition
            hover:bg-amber-300/[0.07]
            hover:text-amber-100
            focus-visible:bg-amber-300/[0.07]
            focus-visible:text-amber-100
            focus-visible:outline-none
            focus-visible:ring-1
            focus-visible:ring-amber-200/30
          "
        >
          <Layers3
            className="h-4 w-4"
            aria-hidden="true"
          />
        </button>

        <div
          className="
            pointer-events-none
            absolute
            bottom-[calc(100%+0.55rem)]
            right-0
            w-20
            translate-y-1
            rounded-2xl
            border border-white/[0.09]
            bg-[#07101e]/95
            p-1.5
            opacity-0
            shadow-[0_22px_60px_rgba(0,0,0,0.48)]
            backdrop-blur-xl
            transition
            group-hover:pointer-events-auto
            group-hover:translate-y-0
            group-hover:opacity-100
            group-focus-within:pointer-events-auto
            group-focus-within:translate-y-0
            group-focus-within:opacity-100
          "
        >
          {BETS_VIEW_VERSIONS
            .slice()
            .reverse()
            .map((version) => (
              <button
                key={version}
                type="button"
                aria-pressed={
                  value === version
                }
                aria-label={`Use Betting Hall ${version}`}
                onClick={() =>
                  onChange(version)
                }
                className={`
                  flex h-9 w-full
                  items-center justify-center
                  rounded-xl
                  text-[10px]
                  font-black
                  tracking-[0.18em]
                  transition
                  ${
                    value === version
                      ? "bg-amber-300/[0.11] text-amber-100 ring-1 ring-amber-200/20"
                      : "text-slate-500 hover:bg-white/[0.05] hover:text-white"
                  }
                `}
              >
                {version}
              </button>
            ))}
        </div>
      </div>
    </section>
  );
}
