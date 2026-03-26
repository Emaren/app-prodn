export type LobbyThemeKey =
  | "black"
  | "grey"
  | "white"
  | "sepia"
  | "walnut"
  | "crimson"
  | "midnight";

export type LobbyViewMode = "steel" | "field";

type LobbyThemeOption = {
  key: LobbyThemeKey;
  label: string;
  swatch: string;
  heroBackground: string;
};

type LobbyViewOption = {
  key: LobbyViewMode;
  label: string;
};

export const LOBBY_THEME_OPTIONS: LobbyThemeOption[] = [
  {
    key: "black",
    label: "Black",
    swatch: "linear-gradient(135deg,#050505,#1a1a1d)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(255,255,255,0.08), transparent 28%), linear-gradient(135deg, #040404, #0d0f12 54%, #16191f)",
  },
  {
    key: "grey",
    label: "Grey",
    swatch: "linear-gradient(135deg,#63666d,#2b313a)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(226,232,240,0.18), transparent 30%), linear-gradient(135deg, #111827, #374151 52%, #1f2937)",
  },
  {
    key: "white",
    label: "White",
    swatch: "linear-gradient(135deg,#f8fafc,#cbd5e1)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(255,255,255,0.22), transparent 28%), linear-gradient(135deg, #1f2937, #475569 52%, #0f172a)",
  },
  {
    key: "sepia",
    label: "Sepia",
    swatch: "linear-gradient(135deg,#f2d7ac,#8b6b42)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(245, 205, 141, 0.2), transparent 29%), linear-gradient(135deg, #1b140d, #5b4630 52%, #24180d)",
  },
  {
    key: "walnut",
    label: "Walnut",
    swatch: "linear-gradient(135deg,#6b4226,#2b1810)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(166, 94, 46, 0.22), transparent 29%), linear-gradient(135deg, #160d08, #3b2418 52%, #120a07)",
  },
  {
    key: "crimson",
    label: "Crimson",
    swatch: "linear-gradient(135deg,#a10f2b,#2b0a12)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(239, 68, 68, 0.18), transparent 30%), linear-gradient(135deg, #1a0810, #3f1020 52%, #12060c)",
  },
  {
    key: "midnight",
    label: "Midnight",
    swatch: "linear-gradient(135deg,#0f274f,#050b18)",
    heroBackground:
      "radial-gradient(circle at top left, rgba(59, 130, 246, 0.16), transparent 30%), linear-gradient(135deg, #0f172a, #111827 55%, #0b1120)",
  },
];

export const LOBBY_VIEW_OPTIONS: LobbyViewOption[] = [
  { key: "steel", label: "Steel" },
  { key: "field", label: "Field" },
];

function findThemeOption(themeKey: LobbyThemeKey) {
  return LOBBY_THEME_OPTIONS.find((option) => option.key === themeKey) || LOBBY_THEME_OPTIONS[6];
}

export function isLobbyThemeKey(value: string | null): value is LobbyThemeKey {
  return LOBBY_THEME_OPTIONS.some((option) => option.key === value);
}

export function isLobbyViewMode(value: string | null): value is LobbyViewMode {
  return LOBBY_VIEW_OPTIONS.some((option) => option.key === value);
}

export function getLobbyHeroBackground(themeKey: LobbyThemeKey, viewMode: LobbyViewMode) {
  const theme = findThemeOption(themeKey);
  const viewOverlay =
    viewMode === "field"
      ? "radial-gradient(circle at 78% 18%, rgba(74, 222, 128, 0.18), transparent 34%), "
      : "radial-gradient(circle at 78% 18%, rgba(251, 191, 36, 0.14), transparent 34%), ";

  return `${viewOverlay}${theme.heroBackground}`;
}
