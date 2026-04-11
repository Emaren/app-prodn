"use client";

import { useMemo, useState, type KeyboardEvent } from "react";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import {
  formatDateTime,
  type TimeDisplayMode,
} from "@/lib/timeDisplay";

type TimeDisplayTextProps = {
  value: string | Date | null | undefined;
  className?: string;
  bubbleClassName?: string;
  emptyValue?: string;
  includeZone?: boolean;
  includeSeconds?: boolean;
};

function formatForMode(
  value: string | Date | null | undefined,
  mode: TimeDisplayMode,
  browserTimeZone: string | null,
  includeZone: boolean,
  includeSeconds: boolean
) {
  return formatDateTime(
    value,
    {
      timeDisplayMode: mode,
      timezoneOverride: browserTimeZone,
    },
    {
      browserTimeZone,
      includeZone,
      includeSeconds,
    }
  );
}

export default function TimeDisplayText({
  value,
  className,
  bubbleClassName,
  emptyValue = "—",
  includeZone = true,
  includeSeconds = false,
}: TimeDisplayTextProps) {
  const { timeDisplayMode, browserTimeZone } = useLobbyAppearance();
  const [showMobileReveal, setShowMobileReveal] = useState(false);

  const primaryText = useMemo(
    () =>
      formatForMode(
        value,
        timeDisplayMode,
        browserTimeZone,
        includeZone,
        includeSeconds
      ),
    [browserTimeZone, includeSeconds, includeZone, timeDisplayMode, value]
  );

  const oppositeMode = timeDisplayMode === "utc" ? "local" : "utc";
  const oppositeText = useMemo(
    () =>
      formatForMode(
        value,
        oppositeMode,
        browserTimeZone,
        includeZone,
        includeSeconds
      ),
    [browserTimeZone, includeSeconds, includeZone, oppositeMode, value]
  );

  if (primaryText === "—") {
    return <span className={className}>{emptyValue}</span>;
  }

  function toggleMobileReveal() {
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }

    setShowMobileReveal((current) => !current);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleMobileReveal();
  }

  return (
    <span className="group relative inline-flex items-center">
      <span
        className={className}
        role="button"
        tabIndex={0}
        onClick={toggleMobileReveal}
        onKeyDown={handleKeyDown}
        title={oppositeText}
      >
        {primaryText}
      </span>
      <span
        className={[
          "pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 text-[11px] font-medium text-slate-100 opacity-0 shadow-[0_18px_45px_rgba(0,0,0,0.34)] transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          showMobileReveal ? "opacity-100" : "",
          bubbleClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {oppositeText}
      </span>
    </span>
  );
}
