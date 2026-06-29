export const EVENT_TILE_STATUSES = [
  "draft",
  "scheduled",
  "live",
  "completed",
  "archived",
] as const;

export type EventTileStatus = (typeof EVENT_TILE_STATUSES)[number];

export type EventTileTitleTransform = "uppercase" | "none" | "capitalize";
export type EventTileTitleStyle = "normal" | "italic";
export type EventTileTitleAlign = "left" | "center" | "right";

export type EventTileStyleConfig = {
  titleFontFamily: string;
  titleColor: string;
  titleDesktopSize: string;
  titleMobileSize: string;
  titleWeight: number;
  titleStyle: EventTileTitleStyle;
  titleTransform: EventTileTitleTransform;
  titleLetterSpacing: string;
  titleLineHeight: string;
  titleDesktopTop: number;
  titleDesktopLeft: number;
  titleDesktopWidth: number;
  titleMobileNudge: number;
  titleAlign: EventTileTitleAlign;
  titleRotate: number;
};

export const DEFAULT_EVENT_TILE_STYLE_CONFIG: EventTileStyleConfig = {
  titleFontFamily: 'Georgia, "Times New Roman", serif',
  titleColor: "#fef3c7",
  titleDesktopSize: "clamp(4.1rem,9.2vw,10rem)",
  titleMobileSize: "clamp(3.4rem,16vw,4.8rem)",
  titleWeight: 900,
  titleStyle: "normal",
  titleTransform: "uppercase",
  titleLetterSpacing: "-0.045em",
  titleLineHeight: "0.78",
  titleDesktopTop: 8.4,
  titleDesktopLeft: 50,
  titleDesktopWidth: 96,
  titleMobileNudge: 0,
  titleAlign: "center",
  titleRotate: 0,
};

function eventStyleObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function eventStyleString(value: unknown, fallback: string, max = 120) {
  const parsed = typeof value === "string" ? value.trim().slice(0, max) : "";
  if (!parsed) return fallback;
  if (/[;{}<>]/.test(parsed)) return fallback;
  return parsed;
}

function eventStyleColor(value: unknown, fallback: string) {
  const parsed = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(parsed) ? parsed : fallback;
}

function eventStyleNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function eventStyleChoice<T extends string>(value: unknown, fallback: T, allowed: readonly T[]) {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeEventTileStyleConfig(value: unknown): EventTileStyleConfig {
  const raw = eventStyleObject(value);
  const defaults = DEFAULT_EVENT_TILE_STYLE_CONFIG;

  return {
    titleFontFamily: eventStyleString(raw.titleFontFamily, defaults.titleFontFamily, 160),
    titleColor: eventStyleColor(raw.titleColor, defaults.titleColor),
    titleDesktopSize: eventStyleString(raw.titleDesktopSize, defaults.titleDesktopSize, 80),
    titleMobileSize: eventStyleString(raw.titleMobileSize, defaults.titleMobileSize, 80),
    titleWeight: Math.round(eventStyleNumber(raw.titleWeight, defaults.titleWeight, 100, 1000)),
    titleStyle: eventStyleChoice(raw.titleStyle, defaults.titleStyle, ["normal", "italic"] as const),
    titleTransform: eventStyleChoice(raw.titleTransform, defaults.titleTransform, ["uppercase", "none", "capitalize"] as const),
    titleLetterSpacing: eventStyleString(raw.titleLetterSpacing, defaults.titleLetterSpacing, 40),
    titleLineHeight: eventStyleString(raw.titleLineHeight, defaults.titleLineHeight, 40),
    titleDesktopTop: eventStyleNumber(raw.titleDesktopTop, defaults.titleDesktopTop, 0, 100),
    titleDesktopLeft: eventStyleNumber(raw.titleDesktopLeft, defaults.titleDesktopLeft, 0, 100),
    titleDesktopWidth: eventStyleNumber(raw.titleDesktopWidth, defaults.titleDesktopWidth, 25, 100),
    titleMobileNudge: eventStyleNumber(raw.titleMobileNudge, defaults.titleMobileNudge, -160, 160),
    titleAlign: eventStyleChoice(raw.titleAlign, defaults.titleAlign, ["left", "center", "right"] as const),
    titleRotate: eventStyleNumber(raw.titleRotate, defaults.titleRotate, -18, 18),
  };
}


export type EventTileView = {
  id: number | null;
  eventTileId: string;
  slug: string;
  status: EventTileStatus;
  priority: number;
  isPublished: boolean;
  isActive: boolean;
  name: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  chapterLabel: string;
  dateLabel: string;
  eventStartsAt: string | null;
  eventEndsAt: string | null;
  payoutBadgeText: string;
  featuredBadgeText: string;
  ctaLabel: string;
  ctaUrl: string;
  matchFormat: string;
  rulesSummary: string;
  tournamentName: string;
  linkedTrophyId: number | null;
  linkedTrophyName: string | null;
  playerOneUserId: number | null;
  playerOneName: string;
  playerOneAvatarUrl: string;
  playerOneCountry: string | null;
  playerTwoUserId: number | null;
  playerTwoName: string;
  playerTwoAvatarUrl: string;
  playerTwoCountry: string | null;
  commissionerUserId: number | null;
  commissionerName: string;
  commissionerAvatarUrl: string;
  beltImageUrl: string;
  backgroundImageUrl: string;
  mobileBackgroundImageUrl: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  overlayOpacity: number;
  vignetteOpacity: number;
  theme: string;
  styleConfig: EventTileStyleConfig;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  source: "database" | "fallback";
};

export type EventStudioUser = {
  id: number;
  uid: string;
  name: string;
  representedCountry: string | null;
  avatarUrl: string;
};

export type EventStudioTrophy = {
  id: number;
  trophyId: string;
  displayName: string;
  status: string;
};

export type EventStudioMediaAsset = {
  id: number;
  kind: string;
  target: string | null;
  label: string;
  url: string;
  active: boolean;
  updatedAt: string;
};

export type EventStudioSnapshot = {
  events: EventTileView[];
  users: EventStudioUser[];
  trophies: EventStudioTrophy[];
  mediaAssets: EventStudioMediaAsset[];
  activeEventId: number | null;
  generatedAt: string;
};

export function isSafeEventMediaUrl(value: string | null | undefined) {
  if (!value) return true;
  if (/[\s\\"'()<>]/.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export const FALLBACK_EVENT_TILE: EventTileView = {
  id: null,
  eventTileId: "wolomania-i-fallback",
  slug: "wolomania",
  status: "scheduled",
  priority: 100,
  isPublished: true,
  isActive: true,
  name: "Wolomania",
  eyebrow: "The World Championship Event",
  title: "WOLOMANIA",
  subtitle: "I",
  description: "The first AoE2WAR world championship event.",
  chapterLabel: "July 10 · First Chapter",
  dateLabel: "July 10, 2026",
  eventStartsAt: "2026-07-10T20:00:00.000Z",
  eventEndsAt: null,
  payoutBadgeText: "On-chain payout",
  featuredBadgeText: "Featured Event",
  ctaLabel: "Enter Wolomania",
  ctaUrl: "/wolomania",
  matchFormat: "Best of 7",
  rulesSummary: "100,000 WOLO",
  tournamentName: "AoE2HD Founders Cup",
  linkedTrophyId: null,
  linkedTrophyName: null,
  playerOneUserId: null,
  playerOneName: "Jim",
  playerOneAvatarUrl: "/uploads/managed-assets/wolomania/jim_warrior.webp",
  playerOneCountry: "USA",
  playerTwoUserId: null,
  playerTwoName: "Julio Alvarez",
  playerTwoAvatarUrl: "/uploads/managed-assets/wolomania/julio_warrior.webp",
  playerTwoCountry: "Mexico",
  commissionerUserId: null,
  commissionerName: "Emaren",
  commissionerAvatarUrl: "/uploads/managed-assets/wolomania/emaren_warrior_2.webp",
  beltImageUrl: "/uploads/managed-assets/wolomania/aoe2war_champ.webp",
  backgroundImageUrl: "",
  mobileBackgroundImageUrl: "",
  gradientFrom: "#150704",
  gradientVia: "#05070d",
  gradientTo: "#071225",
  overlayOpacity: 0.24,
  vignetteOpacity: 0.82,
  theme: "royal",
  styleConfig: DEFAULT_EVENT_TILE_STYLE_CONFIG,
  createdAt: null,
  updatedAt: null,
  publishedAt: null,
  source: "fallback",
};
