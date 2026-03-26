export type LobbyThemeKey =
  | "black"
  | "grey"
  | "white"
  | "sepia"
  | "walnut"
  | "crimson"
  | "midnight";

export type LobbyViewMode = "steel" | "field";

export const LOBBY_THEME_STORAGE_KEY = "aoe2hdbets:lobby-theme";
export const LOBBY_VIEW_STORAGE_KEY = "aoe2hdbets:lobby-view";
export const DEFAULT_LOBBY_THEME: LobbyThemeKey = "midnight";
export const DEFAULT_LOBBY_VIEW: LobbyViewMode = "steel";

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

type LobbyThemeTone = {
  panelShell: string;
  insetPanel: string;
  card: string;
  cardHover: string;
  subduedCard: string;
  subduedCardHover: string;
  eyebrow: string;
  count: string;
  countLabel: string;
  neutralPill: string;
  divider: string;
  input: string;
  circleRing: string;
};

type LobbyAccentTone = {
  accentText: string;
  statusBadge: string;
  primaryButton: string;
  secondaryButton: string;
  viewToggle: string;
  viewToggleActive: string;
  rankBadge: string;
  rating: string;
  activeBadge: string;
  resultPill: string;
  statDefault: string;
  statAccent: string;
};

export type LobbyPresentationTone = LobbyThemeTone & LobbyAccentTone;

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
  return (
    LOBBY_THEME_OPTIONS.find((option) => option.key === themeKey) ||
    LOBBY_THEME_OPTIONS.find((option) => option.key === DEFAULT_LOBBY_THEME) ||
    LOBBY_THEME_OPTIONS[0]
  );
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

export function getLobbyPageBackground(themeKey: LobbyThemeKey, viewMode: LobbyViewMode) {
  const theme = findThemeOption(themeKey);
  const viewOverlay =
    viewMode === "field"
      ? "radial-gradient(circle at 16% 8%, rgba(74, 222, 128, 0.12), transparent 24%), radial-gradient(circle at 84% 12%, rgba(22, 163, 74, 0.14), transparent 26%), "
      : "radial-gradient(circle at 16% 8%, rgba(251, 191, 36, 0.1), transparent 24%), radial-gradient(circle at 84% 12%, rgba(96, 165, 250, 0.12), transparent 26%), ";

  return `${viewOverlay}radial-gradient(circle at 50% 0%, rgba(255,255,255,0.03), transparent 42%), linear-gradient(180deg, rgba(2,6,23,0.82), rgba(2,6,23,0.94) 32%, rgba(2,6,23,0.98) 100%), ${theme.heroBackground}`;
}

function getLobbyThemeTone(themeKey: LobbyThemeKey): LobbyThemeTone {
  switch (themeKey) {
    case "black":
      return {
        panelShell:
          "border-white/10 bg-[linear-gradient(180deg,rgba(14,14,16,0.94),rgba(6,6,8,0.86))] shadow-[0_24px_70px_rgba(0,0,0,0.5)]",
        insetPanel: "border-white/10 bg-black/25",
        card: "border-white/8 bg-white/[0.035]",
        cardHover: "hover:border-white/20 hover:bg-white/[0.065]",
        subduedCard: "border-white/8 bg-black/35",
        subduedCardHover: "hover:border-white/20 hover:bg-black/45",
        eyebrow: "text-white/45",
        count: "text-white",
        countLabel: "text-white/45",
        neutralPill: "border-white/10 bg-white/5 text-slate-300",
        divider: "border-white/8",
        input:
          "border-white/10 bg-slate-950/80 text-white placeholder:text-slate-500 focus:border-amber-300/50",
        circleRing: "ring-white",
      };
    case "grey":
      return {
        panelShell:
          "border-slate-300/12 bg-[linear-gradient(180deg,rgba(48,55,66,0.9),rgba(18,23,31,0.86))] shadow-[0_24px_70px_rgba(15,23,42,0.42)]",
        insetPanel: "border-slate-200/10 bg-slate-900/45",
        card: "border-slate-200/10 bg-slate-400/[0.07]",
        cardHover: "hover:border-slate-200/25 hover:bg-slate-300/[0.11]",
        subduedCard: "border-slate-200/10 bg-slate-950/45",
        subduedCardHover: "hover:border-slate-200/22 hover:bg-slate-900/55",
        eyebrow: "text-slate-100/55",
        count: "text-white",
        countLabel: "text-slate-100/55",
        neutralPill: "border-slate-200/12 bg-slate-400/[0.08] text-slate-100",
        divider: "border-slate-200/10",
        input:
          "border-slate-200/12 bg-slate-950/75 text-white placeholder:text-slate-500 focus:border-amber-300/50",
        circleRing: "ring-slate-200",
      };
    case "white":
      return {
        panelShell:
          "border-stone-200/16 bg-[linear-gradient(180deg,rgba(85,94,112,0.92),rgba(38,45,61,0.88))] shadow-[0_24px_70px_rgba(15,23,42,0.34)]",
        insetPanel: "border-stone-100/12 bg-slate-900/35",
        card: "border-stone-100/12 bg-white/[0.085]",
        cardHover: "hover:border-stone-100/30 hover:bg-white/[0.14]",
        subduedCard: "border-stone-100/10 bg-slate-950/35",
        subduedCardHover: "hover:border-stone-100/28 hover:bg-slate-900/42",
        eyebrow: "text-stone-50/70",
        count: "text-white",
        countLabel: "text-stone-100/60",
        neutralPill: "border-stone-100/14 bg-white/[0.08] text-stone-50",
        divider: "border-stone-100/10",
        input:
          "border-stone-100/12 bg-slate-950/70 text-white placeholder:text-slate-500 focus:border-amber-200/50",
        circleRing: "ring-stone-100",
      };
    case "sepia":
      return {
        panelShell:
          "border-amber-100/14 bg-[linear-gradient(180deg,rgba(88,65,39,0.92),rgba(31,21,12,0.88))] shadow-[0_24px_70px_rgba(55,34,15,0.38)]",
        insetPanel: "border-amber-100/10 bg-[#23170e]/55",
        card: "border-amber-100/10 bg-amber-200/[0.06]",
        cardHover: "hover:border-amber-100/25 hover:bg-amber-200/[0.11]",
        subduedCard: "border-amber-100/10 bg-[#1b120b]/55",
        subduedCardHover: "hover:border-amber-100/22 hover:bg-[#26180d]/60",
        eyebrow: "text-amber-100/60",
        count: "text-white",
        countLabel: "text-amber-100/55",
        neutralPill: "border-amber-100/10 bg-amber-200/[0.06] text-amber-50",
        divider: "border-amber-100/10",
        input:
          "border-amber-100/10 bg-[#1b130d]/80 text-white placeholder:text-amber-100/35 focus:border-amber-200/50",
        circleRing: "ring-amber-100",
      };
    case "walnut":
      return {
        panelShell:
          "border-orange-100/12 bg-[linear-gradient(180deg,rgba(74,45,30,0.92),rgba(26,16,12,0.88))] shadow-[0_24px_70px_rgba(42,20,12,0.4)]",
        insetPanel: "border-orange-100/10 bg-[#24160f]/55",
        card: "border-orange-100/10 bg-orange-200/[0.05]",
        cardHover: "hover:border-orange-100/24 hover:bg-orange-200/[0.1]",
        subduedCard: "border-orange-100/10 bg-[#1a100b]/60",
        subduedCardHover: "hover:border-orange-100/22 hover:bg-[#21120d]/68",
        eyebrow: "text-orange-100/58",
        count: "text-white",
        countLabel: "text-orange-100/52",
        neutralPill: "border-orange-100/10 bg-orange-200/[0.05] text-orange-50",
        divider: "border-orange-100/10",
        input:
          "border-orange-100/10 bg-[#160d08]/80 text-white placeholder:text-orange-100/35 focus:border-amber-200/50",
        circleRing: "ring-orange-100",
      };
    case "crimson":
      return {
        panelShell:
          "border-rose-100/12 bg-[linear-gradient(180deg,rgba(84,25,38,0.92),rgba(37,9,19,0.88))] shadow-[0_24px_70px_rgba(56,10,24,0.42)]",
        insetPanel: "border-rose-100/10 bg-[#260d16]/55",
        card: "border-rose-100/10 bg-rose-200/[0.055]",
        cardHover: "hover:border-rose-100/24 hover:bg-rose-200/[0.1]",
        subduedCard: "border-rose-100/10 bg-[#1f0a12]/60",
        subduedCardHover: "hover:border-rose-100/22 hover:bg-[#2a0f18]/68",
        eyebrow: "text-rose-100/58",
        count: "text-white",
        countLabel: "text-rose-100/52",
        neutralPill: "border-rose-100/10 bg-rose-200/[0.055] text-rose-50",
        divider: "border-rose-100/10",
        input:
          "border-rose-100/10 bg-[#1a0810]/80 text-white placeholder:text-rose-100/35 focus:border-rose-200/50",
        circleRing: "ring-rose-100",
      };
    case "midnight":
    default:
      return {
        panelShell:
          "border-sky-200/12 bg-[linear-gradient(180deg,rgba(18,28,48,0.92),rgba(10,16,31,0.88))] shadow-[0_24px_70px_rgba(5,11,24,0.45)]",
        insetPanel: "border-sky-200/10 bg-slate-950/40",
        card: "border-sky-200/10 bg-white/[0.045]",
        cardHover: "hover:border-sky-200/24 hover:bg-white/[0.08]",
        subduedCard: "border-sky-200/10 bg-[#08101f]/55",
        subduedCardHover: "hover:border-sky-200/22 hover:bg-[#0b1426]/62",
        eyebrow: "text-sky-100/55",
        count: "text-white",
        countLabel: "text-sky-100/52",
        neutralPill: "border-sky-200/10 bg-white/[0.045] text-slate-100",
        divider: "border-sky-200/10",
        input:
          "border-sky-200/10 bg-slate-950/80 text-white placeholder:text-slate-500 focus:border-sky-200/50",
        circleRing: "ring-sky-100",
      };
  }
}

function getLobbyAccentTone(viewMode: LobbyViewMode): LobbyAccentTone {
  if (viewMode === "field") {
    return {
      accentText: "text-emerald-200/70",
      statusBadge: "border-emerald-300/25 bg-emerald-500/15 text-emerald-50",
      primaryButton:
        "bg-emerald-300 text-slate-950 hover:bg-emerald-200 focus-visible:outline-emerald-200",
      secondaryButton:
        "border-emerald-200/18 text-emerald-50/90 hover:border-emerald-200/32 hover:bg-emerald-500/10 hover:text-white",
      viewToggle: "border-emerald-200/12 bg-emerald-950/25 text-emerald-50/85",
      viewToggleActive: "bg-emerald-300 text-slate-950",
      rankBadge: "border-emerald-300/25 bg-emerald-500/14 text-emerald-50",
      rating: "text-emerald-100",
      activeBadge: "border-emerald-300/25 bg-emerald-500/15 text-emerald-50",
      resultPill:
        "border-emerald-300/22 bg-emerald-500/12 text-emerald-50",
      statDefault: "border-emerald-300/12 bg-emerald-500/8",
      statAccent: "text-emerald-100/75",
    };
  }

  return {
    accentText: "text-amber-200/70",
    statusBadge: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    primaryButton:
      "bg-amber-300 text-slate-950 hover:bg-amber-200 focus-visible:outline-amber-200",
    secondaryButton:
      "border-white/15 text-white/85 hover:border-white/30 hover:bg-white/10 hover:text-white",
    viewToggle: "border-white/12 bg-white/5 text-slate-200/80",
    viewToggleActive: "bg-white text-slate-950",
    rankBadge: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    rating: "text-amber-100",
    activeBadge: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    resultPill:
      "border-amber-300/20 bg-amber-400/10 text-amber-100",
    statDefault: "border-white/10 bg-white/5",
    statAccent: "text-slate-400",
  };
}

export function getLobbyPresentationTone(
  themeKey: LobbyThemeKey,
  viewMode: LobbyViewMode
): LobbyPresentationTone {
  return {
    ...getLobbyThemeTone(themeKey),
    ...getLobbyAccentTone(viewMode),
  };
}

export function readStoredLobbyTheme(): LobbyThemeKey {
  if (typeof window === "undefined") {
    return DEFAULT_LOBBY_THEME;
  }

  const storedTheme = window.localStorage.getItem(LOBBY_THEME_STORAGE_KEY);
  return isLobbyThemeKey(storedTheme) ? storedTheme : DEFAULT_LOBBY_THEME;
}

export function writeStoredLobbyTheme(themeKey: LobbyThemeKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOBBY_THEME_STORAGE_KEY, themeKey);
}

export function readStoredLobbyViewMode(): LobbyViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_LOBBY_VIEW;
  }

  const storedView = window.localStorage.getItem(LOBBY_VIEW_STORAGE_KEY);
  return isLobbyViewMode(storedView) ? storedView : DEFAULT_LOBBY_VIEW;
}

export function writeStoredLobbyViewMode(viewMode: LobbyViewMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOBBY_VIEW_STORAGE_KEY, viewMode);
}
