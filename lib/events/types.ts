export const EVENT_TILE_STATUSES = [
  "draft",
  "scheduled",
  "live",
  "completed",
  "archived",
] as const;

export type EventTileStatus = (typeof EVENT_TILE_STATUSES)[number];

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
  playerOneAvatarUrl: "/uploads/managed-assets/wolomania/jim_warrior.png",
  playerOneCountry: "USA",
  playerTwoUserId: null,
  playerTwoName: "Julio Alvarez",
  playerTwoAvatarUrl: "/uploads/managed-assets/wolomania/julio_warrior.png",
  playerTwoCountry: "Mexico",
  commissionerUserId: null,
  commissionerName: "Emaren",
  commissionerAvatarUrl: "/uploads/managed-assets/wolomania/emaren_warrior_2.png",
  beltImageUrl: "/uploads/managed-assets/wolomania/aoe2war_champ.png",
  backgroundImageUrl: "",
  mobileBackgroundImageUrl: "",
  gradientFrom: "#150704",
  gradientVia: "#05070d",
  gradientTo: "#071225",
  overlayOpacity: 0.24,
  vignetteOpacity: 0.82,
  theme: "royal",
  createdAt: null,
  updatedAt: null,
  publishedAt: null,
  source: "fallback",
};
