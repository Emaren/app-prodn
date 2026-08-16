"use client";

import { Palette } from "lucide-react";
import { useEffect, useState } from "react";

import ClanViewToggle from "@/components/clans/ClanViewToggle";
import type { ClanViewMode } from "@/lib/clans";

type ClanTheme = "blue" | "crimson";

const CLAN_THEME_STORAGE_KEY = "aoe2war:clans:theme";

function applyTheme(theme: ClanTheme) {
  document.documentElement.dataset.clanTheme = theme;
}

export default function ClanDisplayRail({
  view,
  basePath,
}: {
  view: ClanViewMode;
  basePath: string;
}) {
  const [theme, setTheme] = useState<ClanTheme>("blue");

  useEffect(() => {
    const stored = window.localStorage.getItem(CLAN_THEME_STORAGE_KEY);
    const nextTheme: ClanTheme = stored === "crimson" ? "crimson" : "blue";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: ClanTheme = theme === "blue" ? "crimson" : "blue";
    setTheme(nextTheme);
    window.localStorage.setItem(CLAN_THEME_STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  }

  const nextThemeLabel = theme === "blue" ? "crimson" : "blue";

  return (
    <section className="clan-display-rail" aria-label="Clan display controls">
      <ClanViewToggle
        view={view}
        basePath={basePath}
        label="Clan view mode"
      />

      <button
        type="button"
        className="clan-theme-toggle"
        onClick={toggleTheme}
        aria-pressed={theme === "crimson"}
        aria-label={`Switch clan theme to ${nextThemeLabel}`}
        title={`Switch to ${nextThemeLabel}`}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
        <span className="clan-theme-toggle__track" aria-hidden="true">
          <span className="clan-theme-toggle__thumb" />
        </span>
      </button>
    </section>
  );
}
