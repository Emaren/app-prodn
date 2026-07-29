"use client";

import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import {
  formatDateTime,
  type DateLike,
  type FormatDateTimeOptions,
  type TimeClockMode,
  type TimeDisplayMode,
} from "@/lib/timeDisplay";

type TimeDisplayTextProps = {
  value: string | Date | null | undefined;
  className?: string;
  bubbleClassName?: string;
  emptyValue?: string;
  includeZone?: boolean;
  includeSeconds?: boolean;
  includeYear?: boolean;
  dateOnly?: boolean;
  timeOnly?: boolean;
  weekday?: "short" | "long";
  month?: "short" | "long";
};

function formatForMode(
  value: DateLike,
  mode: TimeDisplayMode,
  clockMode: TimeClockMode,
  browserTimeZone: string | null,
  options: FormatDateTimeOptions
) {
  return formatDateTime(
    value,
    {
      timeDisplayMode: mode,
      timeClockMode: clockMode,
      timezoneOverride: null,
    },
    {
      browserTimeZone,
      ...options,
    }
  );
}

export function useTimeDisplayFormatter() {
  const {
    timeDisplayMode,
    timeClockMode,
    browserTimeZone,
    appearanceLoaded,
  } = useLobbyAppearance();
  const resolvedDisplayMode = appearanceLoaded ? timeDisplayMode : "utc";
  const resolvedBrowserTimeZone = appearanceLoaded ? browserTimeZone : null;

  return useCallback(
    (value: DateLike, options: FormatDateTimeOptions = {}) =>
      formatForMode(
        value,
        resolvedDisplayMode,
        timeClockMode,
        resolvedBrowserTimeZone,
        options
      ),
    [resolvedBrowserTimeZone, resolvedDisplayMode, timeClockMode]
  );
}

export default function TimeDisplayText({
  value,
  className,
  bubbleClassName,
  emptyValue = "—",
  includeZone = true,
  includeSeconds = false,
  includeYear = false,
  dateOnly = false,
  timeOnly = false,
  weekday,
  month,
}: TimeDisplayTextProps) {
  const {
    timeDisplayMode,
    timeClockMode,
    browserTimeZone,
    appearanceLoaded,
  } = useLobbyAppearance();
  const [showMobileReveal, setShowMobileReveal] = useState(false);
  const resolvedDisplayMode = appearanceLoaded ? timeDisplayMode : "utc";
  const resolvedBrowserTimeZone = appearanceLoaded ? browserTimeZone : null;

  const primaryText = useMemo(
    () =>
      formatForMode(
        value,
        resolvedDisplayMode,
        timeClockMode,
        resolvedBrowserTimeZone,
        {
          includeZone,
          includeSeconds,
          includeYear,
          dateOnly,
          timeOnly,
          weekday,
          month,
        }
      ),
    [
      dateOnly,
      includeSeconds,
      includeYear,
      includeZone,
      month,
      resolvedBrowserTimeZone,
      resolvedDisplayMode,
      timeClockMode,
      timeOnly,
      value,
      weekday,
    ]
  );

  const oppositeMode = resolvedDisplayMode === "utc" ? "local" : "utc";
  const oppositeText = useMemo(
    () =>
      formatForMode(
        value,
        oppositeMode,
        timeClockMode,
        resolvedBrowserTimeZone,
        {
          includeZone,
          includeSeconds,
          includeYear,
          dateOnly,
          timeOnly,
          weekday,
          month,
        }
      ),
    [
      dateOnly,
      includeSeconds,
      includeYear,
      includeZone,
      month,
      oppositeMode,
      resolvedBrowserTimeZone,
      timeClockMode,
      timeOnly,
      value,
      weekday,
    ]
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
