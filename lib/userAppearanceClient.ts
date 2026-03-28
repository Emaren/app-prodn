"use client";

import type {
  LobbyTextColor,
  LobbyThemeKey,
  LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";

export type AppearancePayload = {
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  textColor: LobbyTextColor;
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
  viewMode: LobbyViewMode;
  textColor: LobbyTextColor;
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
