"use client";

import { Crown, Palette } from "lucide-react";
import { useEffect, useState } from "react";

import ClanChatAppearanceControls from "@/components/clans/ClanChatAppearanceControls";
import ClanChatViewPicker from "@/components/clans/ClanChatViewPicker";
import ClanViewToggle from "@/components/clans/ClanViewToggle";
import type { ClanViewMode } from "@/lib/clans";
import type { ClanChatViewMode } from "@/lib/clanChatViews";

type ClanTheme =
  | "site"
  | "premium"
  | "premium-light"
  | "premium-dark"
  | "crimson";

const CLAN_THEME_STORAGE_KEY = "aoe2war:clans:theme";
const CLAN_THEME_EVENT = "aoe2war:clan-theme-change";

function normalizeTheme(value: string | null): ClanTheme {
  if (value === "premium") return "premium";
  if (value === "premium-light") return "premium-light";
  if (value === "premium-dark" || value === "blue") return "premium-dark";
  if (value === "crimson") return "crimson";
  return "site";
}

function applyTheme(theme: ClanTheme) {
  document.documentElement.dataset.clanTheme = theme;
  window.dispatchEvent(
    new CustomEvent<ClanTheme>(CLAN_THEME_EVENT, {
      detail: theme,
    }),
  );
}

export default function ClanDisplayRail({
  view,
  basePath,
  clanSlug,
  defaultChatView,
  canManage = false,
  defaultViewBusy = false,
  onDefaultChatViewChange,
}: {
  view: ClanViewMode;
  basePath: string;
  clanSlug?: string;
  defaultChatView?: ClanChatViewMode;
  canManage?: boolean;
  defaultViewBusy?: boolean;
  onDefaultChatViewChange?: (mode: ClanChatViewMode) => void;
}) {
  const [theme, setTheme] =
    useState<ClanTheme>("site");

  useEffect(() => {
    const stored =
      window.localStorage.getItem(
        CLAN_THEME_STORAGE_KEY,
      );
    const nextTheme =
      normalizeTheme(stored);

    if (stored === "standard") {
      window.localStorage.setItem(
        CLAN_THEME_STORAGE_KEY,
        "site",
      );
    }

    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: ClanTheme =
      theme === "site"
        ? "premium"
        : theme === "premium"
          ? "premium-light"
          : theme === "premium-light"
            ? "premium-dark"
            : theme === "premium-dark"
              ? "crimson"
              : "site";

    setTheme(nextTheme);
    window.localStorage.setItem(
      CLAN_THEME_STORAGE_KEY,
      nextTheme,
    );
    applyTheme(nextTheme);
  }

  const nextThemeLabel =
    theme === "site"
      ? "premium blue"
      : theme === "premium"
        ? "light premium blue"
        : theme === "premium-light"
          ? "dark premium blue"
          : theme === "premium-dark"
            ? "dark premium red"
            : "default AoE2WAR blue";

  return (
    <section
      className="clan-display-rail"
      aria-label="Clan display controls"
    >
      <div className="clan-display-rail__group">
        <span className="clan-display-rail__label">
          Layout
        </span>
        <ClanViewToggle
          view={view}
          basePath={basePath}
          label="Clan view mode"
        />
      </div>

      {clanSlug && defaultChatView ? (
        <>
          <span
            className="clan-display-rail__divider"
            aria-hidden="true"
          />

          <div className="clan-display-rail__group">
            <span className="clan-display-rail__label">
              Chat
            </span>
            <ClanChatViewPicker
              clanSlug={clanSlug}
              defaultMode={defaultChatView}
            />
          </div>

          {canManage && onDefaultChatViewChange ? (
            <>
              <span
                className="clan-display-rail__divider"
                aria-hidden="true"
              />
              <div
                className={`clan-display-rail__group ${defaultViewBusy ? "opacity-55" : ""}`}
                aria-label="Clan admin Hall default view"
              >
                <span className="clan-display-rail__label inline-flex items-center gap-1">
                  <Crown className="h-3 w-3 text-amber-200/70" aria-hidden="true" />
                  Default
                </span>
                <ClanChatViewPicker
                  clanSlug={clanSlug}
                  defaultMode={defaultChatView}
                  controlledMode={defaultChatView}
                  onControlledChange={onDefaultChatViewChange}
                  labelPrefix="Hall default"
                />
              </div>
            </>
          ) : null}

          <span
            className="clan-display-rail__divider"
            aria-hidden="true"
          />

          <ClanChatAppearanceControls />
        </>
      ) : null}

      <span
        className="clan-display-rail__divider"
        aria-hidden="true"
      />

      <button
        type="button"
        className="clan-theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch clan theme to ${nextThemeLabel}`}
        title={`Switch to ${nextThemeLabel}`}
      >
        <Palette
          className="h-4 w-4"
          aria-hidden="true"
        />
      </button>
    </section>
  );
}
