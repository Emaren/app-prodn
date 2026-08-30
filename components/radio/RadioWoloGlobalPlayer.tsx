"use client";

import React from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Palette,
  Pause,
  Play,
  Radio,
  X,
} from "lucide-react";

import {
  useRadioWoloListener,
} from "@/hooks/useRadioWoloListener";

type PlayerMode =
  | "dormant"
  | "compact"
  | "expanded";

const STORAGE_KEY =
  "aoe2war:radio-wolo-player-mode:v1";

const THEME_STORAGE_KEY =
  "aoe2war:radio-wolo-player-theme:v1";

const PLAYER_THEMES = [
  {
    id: "ember",
    label: "Ember",
    accent: "red",
    dormant:
      "border-red-900/80 bg-[#090604]/96 text-amber-500 hover:border-amber-700/70 hover:text-amber-300",
    shell:
      "border-red-900/70 bg-[radial-gradient(circle_at_8%_0%,rgba(127,29,29,0.32),transparent_44%),linear-gradient(145deg,#0d0806,#050606_72%)]",
    dot:
      "bg-red-600 shadow-[0_0_11px_rgba(220,38,38,0.88)]",
    control:
      "border-red-900/65 bg-red-950/40 text-amber-500 hover:border-amber-700/70 hover:text-amber-300",
    play:
      "border-red-700/75 bg-[linear-gradient(180deg,#991b1b,#601010)] text-amber-50 hover:border-amber-600/70",
    textTone:
      "text-amber-500/80",
    live:
      "text-red-500",
    line:
      "via-red-800/60",
    progress:
      "bg-[linear-gradient(90deg,#7f1d1d,#dc2626_58%,#b45309)]",
  },
  {
    id: "imperial",
    label: "Imperial",
    accent: "blue",
    dormant:
      "border-amber-900/70 bg-[#050813]/96 text-amber-500 hover:border-amber-600/70 hover:text-amber-300",
    shell:
      "border-amber-900/55 bg-[radial-gradient(circle_at_8%_0%,rgba(30,58,138,0.35),transparent_44%),linear-gradient(145deg,#070b18,#04060b_72%)]",
    dot:
      "bg-amber-500 shadow-[0_0_11px_rgba(245,158,11,0.86)]",
    control:
      "border-blue-900/70 bg-blue-950/45 text-amber-500 hover:border-amber-700/70 hover:text-amber-300",
    play:
      "border-blue-700/75 bg-[linear-gradient(180deg,#1e40af,#172554)] text-amber-50 hover:border-amber-600/70",
    textTone:
      "text-amber-500/80",
    live:
      "text-amber-500",
    line:
      "via-amber-700/55",
    progress:
      "bg-[linear-gradient(90deg,#1e3a8a,#2563eb_58%,#b45309)]",
  },
  {
    id: "iron",
    label: "Iron",
    accent: "orange",
    dormant:
      "border-zinc-700/80 bg-[#080909]/96 text-orange-500 hover:border-orange-800/75 hover:text-orange-400",
    shell:
      "border-zinc-700/75 bg-[radial-gradient(circle_at_8%_0%,rgba(63,63,70,0.40),transparent_44%),linear-gradient(145deg,#0c0c0d,#050606_72%)]",
    dot:
      "bg-orange-600 shadow-[0_0_11px_rgba(234,88,12,0.86)]",
    control:
      "border-zinc-700/75 bg-zinc-900/65 text-orange-500 hover:border-orange-800/75 hover:text-orange-400",
    play:
      "border-orange-900/85 bg-[linear-gradient(180deg,#7c2d12,#431407)] text-orange-50 hover:border-orange-700/75",
    textTone:
      "text-orange-500/80",
    live:
      "text-orange-500",
    line:
      "via-orange-900/60",
    progress:
      "bg-[linear-gradient(90deg,#3f3f46,#ea580c_62%,#9a3412)]",
  },
  {
    id: "verdant",
    label: "Verdant",
    accent: "green",
    dormant:
      "border-emerald-900/80 bg-[#050a07]/96 text-amber-600 hover:border-amber-800/70 hover:text-amber-500",
    shell:
      "border-emerald-900/70 bg-[radial-gradient(circle_at_8%_0%,rgba(6,78,59,0.38),transparent_44%),linear-gradient(145deg,#06100b,#040706_72%)]",
    dot:
      "bg-emerald-600 shadow-[0_0_11px_rgba(5,150,105,0.86)]",
    control:
      "border-emerald-900/70 bg-emerald-950/50 text-amber-600 hover:border-amber-800/70 hover:text-amber-500",
    play:
      "border-emerald-800/85 bg-[linear-gradient(180deg,#065f46,#064e3b)] text-amber-50 hover:border-amber-700/70",
    textTone:
      "text-amber-600/80",
    live:
      "text-emerald-500",
    line:
      "via-emerald-800/55",
    progress:
      "bg-[linear-gradient(90deg,#065f46,#059669_58%,#a16207)]",
  },
] as const;

type PlayerThemeId =
  (typeof PLAYER_THEMES)[number]["id"];

function readStoredTheme(): PlayerThemeId {
  if (typeof window === "undefined") {
    return "ember";
  }

  try {
    const stored =
      window.localStorage.getItem(
        THEME_STORAGE_KEY,
      );

    const found =
      PLAYER_THEMES.find(
        (theme) =>
          theme.id === stored,
      );

    if (found) {
      return found.id;
    }
  } catch {
    // Theme persistence is optional.
  }

  return "ember";
}

function readStoredMode(): PlayerMode {
  if (
    typeof window ===
    "undefined"
  ) {
    return "dormant";
  }

  try {
    const stored =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (
      stored === "compact" ||
      stored === "expanded"
    ) {
      return stored;
    }
  } catch {
    // Storage failure must never prevent radio controls.
  }

  return "dormant";
}

function formatClock(
  valueMs: number,
) {
  const safeMs =
    Number.isFinite(valueMs)
      ? Math.max(
          0,
          valueMs,
        )
      : 0;

  const seconds =
    Math.floor(
      safeMs / 1000,
    );

  const minutes =
    Math.floor(
      seconds / 60,
    );

  const remainingSeconds =
    seconds % 60;

  return `${minutes}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

function progressPercent(
  valueMs: number,
  durationMs: number,
) {
  if (
    !Number.isFinite(
      durationMs,
    ) ||
    durationMs <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(
      0,
      (
        valueMs /
        durationMs
      ) * 100,
    ),
  );
}

export default function RadioWoloGlobalPlayer() {
  const {
    station,
    status,
    error,

    isListening,
    isActuallyPlaying,
    playbackBlocked,

    liveOffsetMs,
    liveElapsedMs,

    startListening,
    stopListening,
    syncStation,
  } =
    useRadioWoloListener();

  const [
    mode,
    setMode,
  ] =
    React.useState<PlayerMode>(
      "dormant",
    );

  React.useEffect(() => {
    setMode(
      readStoredMode(),
    );
  }, []);

  const [
    themeId,
    setThemeId,
  ] =
    React.useState<PlayerThemeId>(
      "ember",
    );

  React.useEffect(() => {
    setThemeId(
      readStoredTheme(),
    );
  }, []);

  const theme =
    PLAYER_THEMES.find(
      (entry) =>
        entry.id === themeId,
    ) ?? PLAYER_THEMES[0];

  const cycleTheme =
    React.useCallback(() => {
      const index =
        PLAYER_THEMES.findIndex(
          (entry) =>
            entry.id === themeId,
        );

      const next =
        PLAYER_THEMES[
          (index + 1) %
            PLAYER_THEMES.length
        ] ?? PLAYER_THEMES[0];

      setThemeId(next.id);

      try {
        window.localStorage.setItem(
          THEME_STORAGE_KEY,
          next.id,
        );
      } catch {
        // Theme persistence is optional.
      }
    }, [themeId]);

  const setStoredMode =
    React.useCallback(
      (
        next:
          PlayerMode,
      ) => {
        setMode(next);

        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            next,
          );
        } catch {
          // Presentation persistence is optional.
        }
      },
      [],
    );

  const current =
    station?.clock?.current ??
    null;

  const next =
    station?.clock?.next ??
    null;

  const isOnAir =
    station?.state ===
      "on_air" &&
    Boolean(current);

  const currentTitle =
    current?.asset.title
      ?.trim() ||
    null;

  const currentCredit =
    current?.asset.credit
      ?.trim() ||
    null;

  const currentKind =
    current?.asset.kind
      ?.trim() ||
    null;

  const nextTitle =
    next?.asset.title
      ?.trim() ||
    null;

  const programName =
    station?.program?.name
      ?.trim() ||
    null;

  const trackProgress =
    progressPercent(
      liveOffsetMs,
      current?.asset
        .durationMs ??
        0,
    );

  const programProgress =
    progressPercent(
      liveElapsedMs,
      station?.clock
        ?.durationMs ??
        0,
    );

  const signalLabel =
    isOnAir
      ? "ON AIR"
      : status ===
          "syncing"
        ? "TUNING"
        : "OFF AIR";

  const displayTitle =
    currentTitle ??
    (
      isOnAir
        ? "Kingdom broadcast"
        : "The transmitter is silent"
    );

  const handlePlayToggle =
    React.useCallback(
      () => {
        if (
          isListening &&
          !playbackBlocked
        ) {
          stopListening();
          return;
        }

        if (isOnAir) {
          void startListening();
        }
      },
      [
        isListening,
        isOnAir,
        playbackBlocked,
        startListening,
        stopListening,
      ],
    );

  if (
    mode ===
    "dormant"
  ) {
    return (
      <button
        type="button"
        data-radio-wolo-player
        data-radio-wolo-mode="dormant"
        onClick={() =>
          setStoredMode(
            "compact",
          )
        }
        className={`group fixed bottom-[calc(env(safe-area-inset-bottom)+5.8rem)] left-3 z-[169] grid h-11 w-11 place-items-center rounded-full border shadow-[0_14px_44px_rgba(0,0,0,0.58)] backdrop-blur-xl transition lg:bottom-4 lg:left-4 ${theme.dormant}`}
        aria-label={
          isOnAir
            ? "Open Radio WOLO. The station is on air."
            : "Open Radio WOLO."
        }
        title={
          isOnAir
            ? "Radio WOLO · ON AIR"
            : "Radio WOLO"
        }
      >
        <Radio className="h-[1.15rem] w-[1.15rem]" />

        {isOnAir ? (
          <span
            aria-hidden="true"
            className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${theme.dot}`}
          />
        ) : null}
      </button>
    );
  }

  return (
    <section
      data-radio-wolo-player
      data-radio-wolo-mode={
        mode
      }
      data-radio-wolo-theme={
        theme.id
      }
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+5.8rem)] left-3 z-[169] overflow-hidden rounded-[1.2rem] border shadow-[0_22px_70px_rgba(0,0,0,0.64)] backdrop-blur-2xl lg:bottom-4 lg:left-4 ${theme.shell} ${
        mode ===
        "expanded"
          ? "w-[min(21rem,calc(100vw-1.5rem))]"
          : "w-[min(18rem,calc(100vw-1.5rem))]"
      }`}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${theme.line}`} />

      <div className="relative flex items-center gap-2.5 p-2.5">
        <button
          type="button"
          onClick={() => {
            void syncStation();
            setStoredMode(
              mode ===
                "expanded"
                ? "compact"
                : "expanded",
            );
          }}
          className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${theme.control}`}
          aria-label={
            mode ===
            "expanded"
              ? "Collapse Radio WOLO"
              : "Expand Radio WOLO"
          }
        >
          <Radio className="h-4 w-4" />

          {isOnAir ? (
            <span
              aria-hidden="true"
              className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${theme.dot}`}
            />
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`truncate text-[10px] font-bold uppercase tracking-[0.2em] ${theme.textTone}`}>
              Radio WOLO
            </span>

            <span
              className={`shrink-0 text-[8px] font-bold uppercase tracking-[0.18em] ${
                isOnAir
                  ? theme.live
                  : "text-slate-500"
              }`}
            >
              {signalLabel}
            </span>
          </div>

          <div className="mt-0.5 truncate text-xs font-medium text-white/90">
            {displayTitle}
          </div>

          {isOnAir ? (
            <div className="mt-0.5 text-[10px] tabular-nums text-white/38">
              {formatClock(
                liveElapsedMs,
              )}
              {isActuallyPlaying
                ? " · LIVE"
                : ""}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled={
            !isOnAir &&
            !isListening
          }
          onClick={
            handlePlayToggle
          }
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition disabled:cursor-default disabled:border-white/[0.06] disabled:bg-white/[0.025] disabled:text-white/20 ${theme.play}`}
          aria-label={
            isListening &&
            !playbackBlocked
              ? "Pause Radio WOLO"
              : "Listen to Radio WOLO"
          }
          title={
            isListening &&
            !playbackBlocked
              ? "Pause"
              : "Listen"
          }
        >
          {isListening &&
          !playbackBlocked ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="ml-0.5 h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={cycleTheme}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${theme.control}`}
          aria-label={`Cycle Radio WOLO color. Current color: ${theme.label}`}
          title={`Color: ${theme.label}`}
        >
          <Palette className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() =>
            setStoredMode(
              "dormant",
            )
          }
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white/30 transition hover:bg-white/[0.045] hover:text-white/75"
          aria-label="Minimize Radio WOLO to its icon"
          title="Minimize"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOnAir ? (
        <div className="h-px bg-white/[0.04]">
          <div
            className={`h-px transition-[width] duration-300 ${theme.progress}`}
            style={{
              width: `${trackProgress}%`,
            }}
          />
        </div>
      ) : null}

      {mode ===
      "expanded" ? (
        <div className="border-t border-white/[0.055] px-3.5 pb-3.5 pt-3">
          <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/35">
            The Kingdom Never Goes Silent.
          </div>

          <div className="mt-3">
            <div className={`text-[9px] uppercase tracking-[0.2em] ${theme.textTone}`}>
              Now
            </div>

            <div className="mt-1 truncate text-sm font-semibold text-white/92">
              {displayTitle}
            </div>

            {currentCredit ? (
              <div className={`mt-0.5 truncate text-xs ${theme.textTone}`}>
                {currentCredit}
              </div>
            ) : null}

            {currentKind ? (
              <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-white/30">
                {currentKind}
              </div>
            ) : null}
          </div>

          {isOnAir ? (
            <>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.055]">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${theme.progress}`}
                  style={{
                    width: `${programProgress}%`,
                  }}
                />
              </div>

              <div className="mt-1.5 flex justify-between text-[9px] tabular-nums text-white/30">
                <span>
                  {formatClock(
                    liveElapsedMs,
                  )}
                </span>
                <span>
                  {formatClock(
                    station?.clock
                      ?.durationMs ??
                      0,
                  )}
                </span>
              </div>
            </>
          ) : null}

          {programName ? (
            <div className="mt-3 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/28">
                Program
              </div>
              <div className="mt-1 truncate text-[11px] text-white/62">
                {programName}
              </div>
            </div>
          ) : null}

          {nextTitle ? (
            <div className="mt-2 rounded-xl border border-white/[0.045] bg-white/[0.018] px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/25">
                Next
              </div>
              <div className="mt-1 truncate text-[11px] text-white/52">
                {nextTitle}
              </div>
            </div>
          ) : null}

          {playbackBlocked ? (
            <div className="mt-3 rounded-xl border border-amber-200/12 bg-amber-300/[0.045] px-3 py-2 text-[10px] leading-4 text-amber-50/65">
              Playback was blocked by the browser. Press Listen again.
            </div>
          ) : null}

          {error ? (
            <div className="mt-3 truncate text-[10px] text-rose-200/60">
              {error}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-between border-t border-white/[0.055] pt-3">
            <Link
              href="/radio"
              className={`text-[10px] font-semibold transition ${theme.textTone}`}
            >
              Open station
            </Link>

            <button
              type="button"
              onClick={() =>
                setStoredMode(
                  "compact",
                )
              }
              className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/30 transition hover:text-white/65"
            >
              <ChevronDown className="h-3 w-3" />
              Compact
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() =>
            setStoredMode(
              "expanded",
            )
          }
          className="flex w-full items-center justify-center gap-1 border-t border-white/[0.04] py-1.5 text-[8px] font-semibold uppercase tracking-[0.18em] text-white/20 transition hover:bg-white/[0.02] hover:text-white/45"
        >
          <ChevronUp className="h-2.5 w-2.5" />
          More
        </button>
      )}
    </section>
  );
}
