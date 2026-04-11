"use client";

import {
  LOBBY_TEXT_COLOR_OPTIONS,
  LOBBY_THEME_OPTIONS,
  LOBBY_VIEW_OPTIONS,
  type LobbyTextColor,
  type LobbyThemeKey,
  type LobbyViewMode,
  type LobbyPresentationTone,
} from "@/components/lobby/lobbyPresentation";

type LobbyThemePickerProps = {
  themeKey: LobbyThemeKey;
  onThemeChange: (themeKey: LobbyThemeKey) => void;
  tone: LobbyPresentationTone;
  size?: "sm" | "md";
  label?: string;
  className?: string;
  trackClassName?: string;
};

type LobbyViewToggleProps = {
  viewMode: LobbyViewMode;
  onViewModeChange: (viewMode: LobbyViewMode) => void;
  tone: LobbyPresentationTone;
  label?: string;
  className?: string;
  size?: "sm" | "xs";
};

type LobbyTextColorPickerProps = {
  textColor: LobbyTextColor;
  onTextColorChange: (textColor: LobbyTextColor) => void;
  tone: LobbyPresentationTone;
  label?: string;
  className?: string;
};

export function LobbyThemePicker({
  themeKey,
  onThemeChange,
  tone,
  size = "sm",
  label,
  className,
  trackClassName,
}: LobbyThemePickerProps) {
  const outerSizeClassName = size === "md" ? "h-7 w-7" : "h-6 w-6";
  const circleSizeClassName = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className={["flex max-w-full flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      {label ? (
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-400">
          {label}
        </div>
      ) : null}

      <div
        className={["flex max-w-full flex-wrap items-center gap-2", trackClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {LOBBY_THEME_OPTIONS.map((option) => {
          const isActive = option.key === themeKey;

          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onThemeChange(option.key)}
              className={[
                "relative inline-flex shrink-0 items-center justify-center rounded-full border border-white/5 transition duration-150 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35",
                outerSizeClassName,
                isActive ? `ring-1 ring-inset ${tone.circleRing} bg-white/[0.045]` : "bg-transparent",
              ]
                .filter(Boolean)
                .join(" ")}
              title={option.label}
              aria-label={`${option.label} theme`}
              aria-pressed={isActive}
            >
              <span
                className={[
                  "block rounded-full border border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]",
                  circleSizeClassName,
                ].join(" ")}
                style={{ backgroundImage: option.swatch }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LobbyViewToggle({
  viewMode,
  onViewModeChange,
  tone,
  label,
  className,
  size = "sm",
}: LobbyViewToggleProps) {
  const buttonClassName =
    size === "xs"
      ? "whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition"
      : "whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition";

  return (
    <div className={["flex max-w-full flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      {label ? (
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-400">
          {label}
        </div>
      ) : null}
      <div className={`inline-flex max-w-full flex-wrap rounded-full border p-1 ${tone.viewToggle}`}>
        {LOBBY_VIEW_OPTIONS.map((option) => {
          const isActive = option.key === viewMode;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onViewModeChange(option.key)}
              className={`${buttonClassName} ${
                isActive ? tone.viewToggleActive : "text-current hover:bg-white/10"
              }`}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LobbyTextColorPicker({
  textColor,
  onTextColorChange,
  tone,
  label,
  className,
}: LobbyTextColorPickerProps) {
  return (
    <div className={["flex flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      {label ? (
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-400">
          {label}
        </div>
      ) : null}
      <div className={`inline-flex max-w-full flex-wrap rounded-full border p-1 ${tone.viewToggle}`}>
        {LOBBY_TEXT_COLOR_OPTIONS.map((option) => {
          const isActive = option.key === textColor;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onTextColorChange(option.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                isActive ? tone.viewToggleActive : "text-current hover:bg-white/10"
              }`}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
