"use client";

import React from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Palette,
  Radio,
  Volume2,
  VolumeX,
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
  "aoe2war:radio-wolo-player-theme:v3";

const SKIN_STORAGE_KEY =
  "aoe2war:radio-wolo-player-skin:v3";

const PLAYER_SKINS = [
  {
    id: "ui",
    label: "UI",
    kind: "ui",
  },
  {
    id: "mini1",
    label: "Mini I",
    kind: "image",
    src: "/radio-wolo/mini.png",
  },
  {
    id: "mini2",
    label: "Mini II",
    kind: "image",
    src: "/radio-wolo/mini2.png",
  },
  {
    id: "mini3",
    label: "Mini III",
    kind: "image",
    src: "/radio-wolo/mini3.png",
  },
  {
    id: "mini4",
    label: "Mini IV",
    kind: "image",
    src: "/radio-wolo/mini4.png",
  },
] as const;

type PlayerSkinId =
  (typeof PLAYER_SKINS)[number]["id"];

function readStoredSkin(): PlayerSkinId {
  if (
    typeof window ===
    "undefined"
  ) {
    return "ui";
  }

  try {
    const stored =
      window.localStorage.getItem(
        SKIN_STORAGE_KEY,
      );

    const found =
      PLAYER_SKINS.find(
        (skin) =>
          skin.id === stored,
      );

    if (found) {
      return found.id;
    }
  } catch {
    // Player appearance persistence is optional.
  }

  return "ui";
}

const AUTOPLAY_STORAGE_KEY =
  "aoe2war:radio-wolo-autoplay:v1";

function readStoredAutoplay() {
  if (
    typeof window ===
    "undefined"
  ) {
    return true;
  }

  try {
    const stored =
      window.localStorage.getItem(
        AUTOPLAY_STORAGE_KEY,
      );

    if (stored === "false") {
      return false;
    }

    if (stored === "true") {
      return true;
    }
  } catch {
    // Autoplay preference is optional.
  }

  // Authenticated Kingdom members default ON.
  // Anonymous visitors are still gated below.
  return true;
}

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
      "border-[#294c78]/70 bg-[#020817]/98 text-amber-300 shadow-[0_0_24px_rgba(17,52,96,0.26)] hover:border-amber-600/55 hover:text-amber-200",
    shell:
      "border-amber-800/30 bg-[radial-gradient(circle_at_80%_92%,rgba(37,99,235,0.19),transparent_47%),radial-gradient(circle_at_69%_106%,rgba(217,119,6,0.065),transparent_34%),linear-gradient(168deg,#01040a_0%,#020814_22%,#061326_48%,#0b2444_73%,#12355f_100%)]",
    dot:
      "bg-amber-500 shadow-[0_0_11px_rgba(245,158,11,0.86)]",
    control:
      "border-[#31547d]/65 bg-[#07172d]/88 text-amber-300 hover:border-amber-600/55 hover:bg-[#0a1d38] hover:text-amber-100",
    play:
      "border-amber-700/55 bg-[radial-gradient(circle_at_50%_20%,rgba(59,130,246,0.22),transparent_52%),linear-gradient(180deg,#0d2b55,#06172f)] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-amber-500/70",
    textTone:
      "text-amber-500/80",
    live:
      "text-amber-500",
    line:
      "via-amber-700/55",
    progress:
      "bg-[linear-gradient(90deg,#1d4ed8,#3b82f6_48%,#d6a52a_100%)]",
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
    return "imperial";
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

  return "imperial";
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

function artFaceBackgroundSize(
  skinId: PlayerSkinId,
) {
  switch (skinId) {
    case "mini1":
    case "mini2":
    case "mini3":
    case "mini4":
      return "100% 100%";

    case "ui":
    default:
      return "100% 100%";
  }
}

function artFaceBackgroundPosition(
  skinId: PlayerSkinId,
) {
  switch (skinId) {
    case "mini1":
      return "center center";

    case "mini2":
      return "center center";

    case "mini3":
      return "center center";

    case "mini4":
      return "center center";

    case "ui":
    default:
      return "center center";
  }
}

function artFaceShellClassName(
  skinId: PlayerSkinId,
) {
  const base =
    "fixed bottom-[calc(env(safe-area-inset-bottom)+5.8rem)] left-3 z-[169] aspect-[4/3] w-[min(19rem,calc(100vw-1.5rem))] bg-transparent shadow-[0_24px_72px_rgba(0,0,0,0.58)] lg:bottom-4 lg:left-4";

  if (
    skinId === "mini1"
  ) {
    return (
      base +
      " overflow-visible rounded-none"
    );
  }

  return (
    base +
    " overflow-hidden rounded-[1.45rem]"
  );
}

function artFaceShowsStandaloneMore(
  skinId: PlayerSkinId,
) {
  return skinId === "mini1";
}

function artFaceMoreHotspotClassName(
  skinId: PlayerSkinId,
) {
  const focusRing =
    " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80";

  switch (skinId) {
    case "mini1":
      return (
        "absolute bottom-[4.0%] right-[4.0%] min-w-[54px] rounded-[10px] border border-amber-300/35 bg-[#060d18]/92 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-amber-100/95 shadow-[0_3px_10px_rgba(0,0,0,0.42)] backdrop-blur-sm transition hover:border-amber-200/60 hover:text-amber-50" +
        focusRing
      );

    case "mini2":
      return (
        "absolute bottom-[2.2%] right-[2.6%] h-[14.5%] w-[23%] rounded-[12px] bg-transparent text-transparent" +
        focusRing
      );

    case "mini3":
      return (
        "absolute bottom-[2.1%] right-[2.4%] h-[14.5%] w-[23%] rounded-[12px] bg-transparent text-transparent" +
        focusRing
      );

    case "mini4":
      return (
        "absolute bottom-[2.2%] right-[2.4%] h-[14.5%] w-[21.5%] rounded-[12px] bg-transparent text-transparent" +
        focusRing
      );

    case "ui":
    default:
      return (
        "absolute bottom-3 right-3 rounded-md border border-amber-300/35 bg-[#060d18]/88 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/90 shadow-[0_4px_12px_rgba(0,0,0,0.38)] backdrop-blur-sm transition hover:border-amber-200/60 hover:text-amber-50" +
        focusRing
      );
  }
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

    targetVolume,
    setTargetVolume,

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
      "imperial",
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
    ) ??
    PLAYER_THEMES.find(
      (entry) =>
        entry.id ===
        "imperial",
    ) ??
    PLAYER_THEMES[0];


  const [
    skinId,
    setSkinId,
  ] =
    React.useState<PlayerSkinId>(
      "ui",
    );

  React.useEffect(() => {
    setSkinId(
      readStoredSkin(),
    );
  }, []);

  const activeSkin =
    PLAYER_SKINS.find(
      (skin) =>
        skin.id === skinId,
    ) ?? PLAYER_SKINS[0];

  const setStoredSkin =
    React.useCallback(
      (
        next:
          PlayerSkinId,
      ) => {
        setSkinId(next);

        try {
          window.localStorage.setItem(
            SKIN_STORAGE_KEY,
            next,
          );
        } catch {
          // Player appearance persistence is optional.
        }
      },
      [],
    );

  const setStoredTheme =
    React.useCallback(
      (
        next:
          PlayerThemeId,
      ) => {
        setThemeId(next);

        try {
          window.localStorage.setItem(
            THEME_STORAGE_KEY,
            next,
          );
        } catch {
          // Theme persistence is optional.
        }
      },
      [],
    );

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

  const [
    autoPlayEnabled,
    setAutoPlayEnabled,
  ] =
    React.useState(true);

  const [
    autoPlaySuppressed,
    setAutoPlaySuppressed,
  ] =
    React.useState(false);

  const autoPlayAttemptRef =
    React.useRef<string | null>(
      null,
    );

  React.useEffect(() => {
    setAutoPlayEnabled(
      readStoredAutoplay(),
    );
  }, []);

  const updateAutoplay =
    React.useCallback(
      (
        next:
          boolean,
      ) => {
        setAutoPlayEnabled(
          next,
        );

        setAutoPlaySuppressed(
          false,
        );

        try {
          window.localStorage.setItem(
            AUTOPLAY_STORAGE_KEY,
            String(next),
          );
        } catch {
          // Preference persistence is optional.
        }
      },
      [],
    );

  React.useEffect(() => {
    const suppressBackgroundPlayback =
      () => {
        if (
          document.visibilityState !==
          "visible"
        ) {
          setAutoPlaySuppressed(
            true,
          );
        }
      };

    const suppressPageHide =
      () => {
        setAutoPlaySuppressed(
          true,
        );
      };

    document.addEventListener(
      "visibilitychange",
      suppressBackgroundPlayback,
    );

    window.addEventListener(
      "pagehide",
      suppressPageHide,
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        suppressBackgroundPlayback,
      );

      window.removeEventListener(
        "pagehide",
        suppressPageHide,
      );
    };
  }, []);

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

  React.useEffect(() => {
    if (
      document.visibilityState !==
        "visible" ||
      !station?.authenticated ||
      station.state !== "on_air" ||
      !station.startedAt ||
      !station.clock?.current ||
      !autoPlayEnabled ||
      autoPlaySuppressed ||
      isListening
    ) {
      return;
    }

    const attemptKey = [
      station.startedAt,
      station.clock.current
        .position,
    ].join(":");

    if (
      autoPlayAttemptRef.current ===
      attemptKey
    ) {
      return;
    }

    autoPlayAttemptRef.current =
      attemptKey;

    // Browser policy may reject this. If so, playbackBlocked
    // leaves the visible Listen control as the graceful fallback.
    void startListening();
  }, [
    autoPlayEnabled,
    autoPlaySuppressed,
    isListening,
    startListening,
    station,
  ]);

  const handleSoundToggle =
    React.useCallback(
      () => {
        if (
          isListening &&
          !playbackBlocked
        ) {
          setAutoPlaySuppressed(
            true,
          );

          stopListening();
          return;
        }

        if (isOnAir) {
          setAutoPlaySuppressed(
            false,
          );

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

  if (
    mode === "compact" &&
    activeSkin.kind === "image"
  ) {
    return (
      <section
        data-radio-wolo-player
        data-radio-wolo-mode="compact"
        data-radio-wolo-theme={
          theme.id
        }
        data-radio-wolo-skin={
          skinId
        }
        data-radio-wolo-art-face
        className={artFaceShellClassName(
          skinId,
        )}
        style={{
          backgroundImage:
            `url("${activeSkin.src}")`,
          backgroundPosition:
            artFaceBackgroundPosition(
              skinId,
            ),
          backgroundRepeat:
            "no-repeat",
          backgroundSize:
            artFaceBackgroundSize(
              skinId,
            ),
        }}
      >
        <span
          className="sr-only"
          aria-live="polite"
        >
          Radio WOLO:
          {" "}
          {signalLabel}
        </span>

        {!isOnAir ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[#020817]/20"
          />
        ) : null}

        <button
          type="button"
          onClick={() =>
            setStoredMode(
              "dormant",
            )
          }
          className="absolute right-[2%] top-[2%] h-[15%] w-[14%] rounded-full bg-transparent text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80"
          aria-label="Close Radio WOLO"
        >
          <span className="sr-only">
            Close
          </span>
        </button>

        <button
          type="button"
          onClick={
            handleSoundToggle
          }
          disabled={
            !isOnAir
          }
          className="absolute left-[39%] top-[54%] h-[31%] w-[22%] rounded-full bg-transparent text-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/80 disabled:cursor-default"
          aria-label={
            isListening &&
            !playbackBlocked
              ? "Turn Radio WOLO sound off"
              : "Turn Radio WOLO sound on"
          }
        >
          <span className="sr-only">
            {isListening &&
            !playbackBlocked
              ? "Sound off"
              : "Sound on"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            void syncStation();

            setStoredMode(
              "expanded",
            );
          }}
          className={artFaceMoreHotspotClassName(
          skinId,
        )}
          aria-label="More Radio WOLO controls"
        >
        {artFaceShowsStandaloneMore(
          skinId,
        ) ? (
          "More"
        ) : (
          <span className="sr-only">
            More
          </span>
        )}

        </button>
      </section>
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
      data-radio-wolo-skin={
        skinId
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
            handleSoundToggle
          }
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition disabled:cursor-default disabled:border-white/[0.06] disabled:bg-white/[0.025] disabled:text-white/20 ${theme.play}`}
          aria-label={
            isListening &&
            !playbackBlocked
              ? "Turn Radio WOLO sound off"
              : "Turn Radio WOLO sound on"
          }
          title={
            isListening &&
            !playbackBlocked
              ? "Sound off"
              : "Sound on"
          }
        >
          {isListening &&
          !playbackBlocked ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
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

          <div className="mt-3 rounded-xl border border-amber-300/[0.10] bg-[#020817]/55 px-3 py-3 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-amber-200/55">
                Player face
              </div>

              <div className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/25">
                {activeSkin.label}
              </div>
            </div>

            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {PLAYER_SKINS.map(
                (skin) => {
                  const selected =
                    skin.id ===
                    skinId;

                  return (
                    <button
                      key={skin.id}
                      type="button"
                      onClick={() => {
                        setStoredSkin(
                          skin.id,
                        );

                        setStoredMode(
                          "compact",
                        );
                      }}
                      className={`relative h-12 overflow-hidden rounded-lg border text-[9px] font-bold uppercase tracking-[0.12em] transition ${
                        selected
                          ? "border-amber-400/45 bg-amber-300/[0.10] text-amber-100"
                          : "border-white/[0.07] bg-[#061126]/70 text-white/40 hover:border-amber-300/20 hover:text-white/70"
                      }`}
                      style={
                        skin.kind ===
                          "image"
                          ? {
                              backgroundImage:
                                `linear-gradient(rgba(2,8,22,.36),rgba(2,8,22,.68)),url("${skin.src}")`,
                              backgroundPosition:
                                "center",
                              backgroundSize:
                                "cover",
                            }
                          : undefined
                      }
                    >
                      {skin.label}
                    </button>
                  );
                },
              )}
            </div>

            <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.05] pt-3">
              <Palette className="h-3 w-3 text-amber-400/55" />

              <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-amber-200/55">
                Warrior tone
              </div>
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {PLAYER_THEMES.map(
                (entry) => {
                  const selected =
                    entry.id ===
                    themeId;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() =>
                        setStoredTheme(
                          entry.id,
                        )
                      }
                      className={`group flex h-9 items-center justify-center rounded-lg border transition ${
                        selected
                          ? "border-amber-400/40 bg-amber-300/[0.10]"
                          : "border-white/[0.06] bg-[#061126]/65 hover:border-amber-300/20"
                      }`}
                      aria-label={`Radio WOLO tone: ${entry.label}`}
                      title={entry.label}
                    >
                      <span
                        className={`h-3.5 w-3.5 rounded-full border border-white/10 ${entry.dormant}`}
                      />
                    </button>
                  );
                },
              )}
            </div>
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

          <div className="mt-3 rounded-xl border border-white/[0.055] bg-black/15 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/32">
                Volume
              </div>

              <div className={`text-[9px] font-semibold tabular-nums ${theme.textTone}`}>
                {Math.round(
                  targetVolume *
                    100,
                )}%
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(
                targetVolume *
                  100,
              )}
              onChange={(event) =>
                setTargetVolume(
                  Number(
                    event.target
                      .value,
                  ) / 100,
                )
              }
              className="mt-2 h-1 w-full cursor-pointer accent-amber-600"
              aria-label="Radio WOLO volume"
            />

            {station?.authenticated ? (
              <button
                type="button"
                onClick={() =>
                  updateAutoplay(
                    !autoPlayEnabled,
                  )
                }
                className="mt-3 flex w-full items-center justify-between border-t border-white/[0.05] pt-2.5 text-left"
              >
                <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-white/32">
                  Auto-enter Radio WOLO
                </span>

                <span className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
                  autoPlayEnabled
                    ? theme.live
                    : "text-white/28"
                }`}>
                  {autoPlayEnabled
                    ? "ON"
                    : "OFF"}
                </span>
              </button>
            ) : (
              <div className="mt-3 border-t border-white/[0.05] pt-2.5 text-[9px] text-white/25">
                Visitors enter Radio WOLO manually.
              </div>
            )}
          </div>

          {programName ? (
            <div className="hidden mt-3 rounded-xl border border-white/[0.055] bg-white/[0.025] px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/28">
                Program
              </div>
              <div className="mt-1 truncate text-[11px] text-white/62">
                {programName}
              </div>
            </div>
          ) : null}

          {nextTitle ? (
            <div className="hidden mt-2 rounded-xl border border-white/[0.045] bg-white/[0.018] px-3 py-2">
              <div className="text-[8px] uppercase tracking-[0.18em] text-white/25">
                Next
              </div>
              <div className="mt-1 truncate text-[11px] text-white/52">
                {nextTitle}
              </div>
            </div>
          ) : null}

          {playbackBlocked ? (
            <div className="hidden mt-3 rounded-xl border border-amber-200/12 bg-amber-300/[0.045] px-3 py-2 text-[10px] leading-4 text-amber-50/65">
              Your browser requires a tap before Radio WOLO can enter. Press Listen once.
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
