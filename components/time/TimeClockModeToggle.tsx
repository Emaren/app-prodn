"use client";

import { TIME_CLOCK_MODES, type TimeClockMode } from "@/lib/timeDisplay";

type TimeClockModeToggleProps = {
  value: TimeClockMode;
  onChange: (value: TimeClockMode) => void;
  className?: string;
};

export default function TimeClockModeToggle({
  value,
  onChange,
  className,
}: TimeClockModeToggleProps) {
  return (
    <div
      className={[
        "inline-flex flex-wrap rounded-full border border-white/10 bg-white/5 p-1",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {TIME_CLOCK_MODES.map((mode) => {
        const active = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition ${
              active
                ? "bg-white text-slate-950"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`}
            aria-pressed={active}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
