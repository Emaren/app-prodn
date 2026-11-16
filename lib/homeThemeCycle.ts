import type { LobbyThemeKey } from "@/components/lobby/lobbyPresentation";

// The home-brand Easter egg cycles only the three campaign-era appearances.
// Any freely selected profile color stays available in the normal picker.
export function nextHomeThemeKey(current: LobbyThemeKey): LobbyThemeKey {
  if (current === "crimson") return "midnight";
  if (current === "midnight") return "black";
  return "crimson";
}
