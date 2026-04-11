"use client";

import type {
  LobbyTextColor,
  LobbyThemeKey,
  LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { TimeDisplayMode } from "@/lib/timeDisplay";

export type AppearancePayload = {
  themeKey: LobbyThemeKey;
  tileThemeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  textColor: LobbyTextColor;
  timeDisplayMode: TimeDisplayMode;
  timezoneOverride: string | null;
  updatedAt: string | null;
};

export async function fetchUserAppearancePreference() {
  const response = await fetch("/api/user/appearance", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Appearance request failed: ${response.status}`);
  }

  return (await response.json()) as AppearancePayload;
}

export async function saveUserAppearancePreference(input: {
  themeKey: LobbyThemeKey;
  tileThemeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  textColor: LobbyTextColor;
  timeDisplayMode: TimeDisplayMode;
  timezoneOverride: string | null;
}) {
  const response = await fetch("/api/user/appearance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Appearance update failed: ${response.status}`);
  }

  return (await response.json()) as AppearancePayload;
}
