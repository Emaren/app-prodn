"use client";

import {
  LOBBY_THEME_OPTIONS,
  LOBBY_VIEW_OPTIONS,
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
};

type LobbyViewToggleProps = {
  viewMode: LobbyViewMode;
  onViewModeChange: (viewMode: LobbyViewMode) => void;
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
}: LobbyThemePickerProps) {
  const circleSizeClassName = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <div className={["flex flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      {label ? (
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-400">
          {label}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {LOBBY_THEME_OPTIONS.map((option) => {
          const isActive = option.key === themeKey;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onThemeChange(option.key)}
              className={`${circleSizeClassName} rounded-full border border-white/10 transition hover:scale-105 ${
                isActive ? `ring-2 ring-offset-2 ring-offset-transparent ${tone.circleRing}` : ""
              }`}
              style={{ backgroundImage: option.swatch }}
              title={option.label}
              aria-label={`${option.label} theme`}
              aria-pressed={isActive}
            />
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
}: LobbyViewToggleProps) {
  return (
    <div className={["flex flex-wrap items-center gap-2", className].filter(Boolean).join(" ")}>
      {label ? (
        <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-400">
          {label}
        </div>
      ) : null}
      <div className={`inline-flex rounded-full border p-1 ${tone.viewToggle}`}>
        {LOBBY_VIEW_OPTIONS.map((option) => {
          const isActive = option.key === viewMode;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onViewModeChange(option.key)}
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
