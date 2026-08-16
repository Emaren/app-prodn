"use client";

import { Palette } from "lucide-react";
import { useEffect, useState } from "react";

import ClanViewToggle from "@/components/clans/ClanViewToggle";
import type { ClanViewMode } from "@/lib/clans";

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
}: {
  view: ClanViewMode;
  basePath: string;
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
      <ClanViewToggle
        view={view}
        basePath={basePath}
        label="Clan view mode"
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
