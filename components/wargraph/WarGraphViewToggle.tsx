"use client";

import * as React from "react";

import type { WarGraphViewMode } from "@/lib/wargraph/publicTypes";
import { WARGRAPH_VIEW_MODES } from "@/lib/wargraph/publicTypes";

const MODE_COPY: Record<
  WarGraphViewMode,
  { label: string; description: string }
> = {
  basic: {
    label: "Basic",
    description: "The board, your move, and the fights that matter.",
  },
  advanced: {
    label: "Advanced",
    description: "Adds readiness, rewards, and live engagement detail.",
  },
  extreme: {
    label: "Extreme",
    description: "The complete board, movement paths, and war ledger.",
  },
};

export function WarGraphViewToggle({
  value,
  onChange,
}: {
  value: WarGraphViewMode;
  onChange: (mode: WarGraphViewMode) => void;
}) {
  const groupId = React.useId();

  return (
    <div>
      <fieldset className="grid grid-cols-3 rounded-[0.9rem] border border-amber-200/20 bg-[#030913]/[0.88] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
        <legend className="sr-only">WarGraph detail level</legend>
        {WARGRAPH_VIEW_MODES.map((mode) => {
          const active = mode === value;
          const copy = MODE_COPY[mode];
          const controlId = `${groupId}-${mode}`;
          const descriptionId = `${controlId}-description`;

          return (
            <label key={mode} htmlFor={controlId} className="relative block cursor-pointer">
              <input
                id={controlId}
                type="radio"
                name={`${groupId}-detail-level`}
                value={mode}
                checked={active}
                aria-describedby={descriptionId}
                onChange={() => onChange(mode)}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-9 items-center justify-center rounded-[0.7rem] px-3 text-[10px] font-black uppercase tracking-[0.18em] transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-amber-200/70 sm:min-w-[7.8rem] sm:text-[11px] motion-reduce:transition-none ${
                  active
                    ? "border border-amber-100/35 bg-[linear-gradient(145deg,#f6d994,#bc812d)] text-[#0a0d12] shadow-[0_7px_25px_rgba(217,160,53,0.25),inset_0_1px_0_rgba(255,255,255,0.55)]"
                    : "border border-transparent text-slate-400 hover:bg-white/[0.055] hover:text-amber-50"
                }`}
              >
                {copy.label}
              </span>
              <span id={descriptionId} className="sr-only">
                {copy.description}
              </span>
            </label>
          );
        })}
      </fieldset>

      <p className="sr-only" aria-live="polite">
        {MODE_COPY[value].description}
      </p>
    </div>
  );
}
