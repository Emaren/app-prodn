"use client";

import { BetsViewMode, edgeButton, insetClass } from "@/components/bets/page-shared";

export default function BetsViewToggle({
  value,
  onChange,
}: {
  value: BetsViewMode;
  onChange: (next: BetsViewMode) => void;
}) {
  return (
    <div className={`${insetClass()} flex items-center gap-1 p-1`}>
      {(["basic", "advanced", "extreme"] as BetsViewMode[]).map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={value === mode}
          onClick={(event) => {
            event.stopPropagation();
            onChange(mode);
          }}
          className={`rounded-full px-3 py-2 text-xs font-medium uppercase tracking-[0.22em] transition ${
            value === mode ? edgeButton(mode === "basic" ? "gold" : mode === "extreme" ? "blue" : "glass") : "text-slate-400 hover:text-white"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}
