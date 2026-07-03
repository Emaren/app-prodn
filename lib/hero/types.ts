import {
  FALLBACK_EVENT_TILE,
  type EventTileView,
} from "../events/types.ts";

export const HERO_PLAYLIST_KEY = "home-lobby-main-stage";

export const HERO_SCREEN_TYPES = [
  "featured_event",
  "chronicle_cover",
  "warrior_quote",
  "media_takeover",
] as const;

export type HeroScreenType = (typeof HERO_SCREEN_TYPES)[number];

export const HERO_SCREEN_STATUSES = ["draft", "published", "archived"] as const;
export type HeroScreenStatus = (typeof HERO_SCREEN_STATUSES)[number];

export const HERO_TRANSITION_STYLES = [
  "crossfade",
  "banner_wipe",
  "siege_push",
  "ember_dissolve",
  "cut",
] as const;

export type HeroTransitionStyle = (typeof HERO_TRANSITION_STYLES)[number];

export type HeroScreenConfig = {
  masthead?: string;
  editionLabel?: string;
  eyebrow?: string;
  kicker?: string;
  quote?: string;
  attribution?: string;
  subline?: string;
  motionPreset?: "embers" | "ink" | "still";
  theme?: "royal" | "chronicle" | "stoic" | "crimson" | "midnight";
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  backgroundImageUrl?: string;
  mobileBackgroundImageUrl?: string;
  videoUrl?: string;
  posterUrl?: string;
  overlayOpacity?: number;
};

export type HeroForumThreadSource = {
  id: number;
  slug: string;
  channel: string;
  tag: string;
  title: string;
  excerpt: string;
  authorLabel: string;
  authorRole: string;
  createdAt: string;
  updatedAt: string;
};

export type HeroMediaAssetSource = {
  id: number;
  kind: string;
  target: string | null;
  label: string;
  url: string;
  alt: string;
  mimeType: string;
  sizeBytes: number;
  active: boolean;
  updatedAt: string;
};

export type HeroScreenDefinition = {
  id: number;
  key: string;
  name: string;
  type: HeroScreenType;
  status: HeroScreenStatus;
  defaultHref: string;
  ariaLabel: string;
  eventTileId: number | null;
  forumThreadId: number | null;
  mediaAssetId: number | null;
  config: HeroScreenConfig;
  createdAt: string;
  updatedAt: string;
};

export type HeroPlaylistSettings = {
  id: number;
  key: string;
  name: string;
  autoplay: boolean;
  defaultDurationMs: number;
  transitionDurationMs: number;
  transitionStyle: HeroTransitionStyle;
  pauseOnHover: boolean;
  showArrows: boolean;
  showDots: boolean;
  showProgress: boolean;
};

export type HeroPlaylistItemSnapshot = {
  id: number;
  position: number;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  durationMs: number | null;
  hrefOverride: string;
  screen: HeroScreenDefinition;
};

export type HeroPlaylistSnapshotData = {
  playlist: HeroPlaylistSettings;
  items: HeroPlaylistItemSnapshot[];
};

export type HeroResolvedScreen = HeroScreenDefinition & {
  eventTile: EventTileView | null;
  forumThread: HeroForumThreadSource | null;
  mediaAsset: HeroMediaAssetSource | null;
};

export type HeroPlaylistItemView = Omit<HeroPlaylistItemSnapshot, "screen"> & {
  href: string;
  screen: HeroResolvedScreen;
};

export type HeroPlaylistView = {
  playlist: HeroPlaylistSettings;
  items: HeroPlaylistItemView[];
  publishedVersion: number | null;
  publishedAt: string | null;
  source: "publication" | "draft-bootstrap" | "fallback";
};

export type HeroPublicationSummary = {
  id: number;
  version: number;
  publishedByUid: string | null;
  publishedAt: string;
};

export type HeroStudioSnapshot = {
  draft: HeroPlaylistView;
  screens: HeroScreenDefinition[];
  eventTiles: EventTileView[];
  forumThreads: HeroForumThreadSource[];
  mediaAssets: HeroMediaAssetSource[];
  publications: HeroPublicationSummary[];
  liveVersion: number | null;
  generatedAt: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback = "", max = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, max) || fallback
    : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function choiceValue<T extends string>(
  value: unknown,
  fallback: T,
  choices: readonly T[]
) {
  return choices.includes(value as T) ? (value as T) : fallback;
}

export function isSafeHeroHref(value: string | null | undefined) {
  if (!value) return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function isSafeHeroMediaUrl(value: string | null | undefined) {
  if (!value) return true;
  if (/[\s\\"'()<>]/.test(value)) return false;
  return isSafeHeroHref(value);
}

export function normalizeHeroScreenType(value: unknown): HeroScreenType {
  return choiceValue(value, "warrior_quote", HERO_SCREEN_TYPES);
}

export function normalizeHeroScreenStatus(value: unknown): HeroScreenStatus {
  return choiceValue(value, "draft", HERO_SCREEN_STATUSES);
}

export function normalizeHeroTransitionStyle(value: unknown): HeroTransitionStyle {
  return choiceValue(value, "crossfade", HERO_TRANSITION_STYLES);
}

export function normalizeHeroScreenConfig(
  type: HeroScreenType,
  value: unknown
): HeroScreenConfig {
  const raw = objectValue(value);
  const backgroundImageUrl = stringValue(raw.backgroundImageUrl, "", 500);
  const mobileBackgroundImageUrl = stringValue(
    raw.mobileBackgroundImageUrl,
    "",
    500
  );
  const videoUrl = stringValue(raw.videoUrl, "", 500);
  const posterUrl = stringValue(raw.posterUrl, "", 500);

  for (const url of [
    backgroundImageUrl,
    mobileBackgroundImageUrl,
    videoUrl,
    posterUrl,
  ]) {
    if (!isSafeHeroMediaUrl(url)) {
      throw new Error("Hero media must use an internal /path or a safe https:// URL.");
    }
  }

  if (type === "chronicle_cover") {
    return {
      masthead: stringValue(raw.masthead, "THE WOLO CHRONICLE", 100),
      editionLabel: stringValue(
        raw.editionLabel,
        "OPEN EDITION · THE LONG WAR CONTINUES",
        140
      ),
      eyebrow: stringValue(raw.eyebrow, "HOUSE DISPATCH", 100),
      kicker: stringValue(raw.kicker, "THE LONG WAR, RECORDED", 140),
      backgroundImageUrl,
      mobileBackgroundImageUrl,
      overlayOpacity: numberValue(raw.overlayOpacity, 0.72, 0, 1),
      theme: choiceValue(raw.theme, "chronicle", [
        "royal",
        "chronicle",
        "stoic",
        "crimson",
        "midnight",
      ] as const),
    };
  }

  if (type === "warrior_quote") {
    return {
      eyebrow: stringValue(raw.eyebrow, "WARRIOR QUOTE OF THE DAY", 100),
      quote: stringValue(
        raw.quote,
        "The calmest warrior sees the whole field.",
        500
      ),
      attribution: stringValue(raw.attribution, "AoE2WAR House Maxim", 140),
      subline: stringValue(
        raw.subline,
        "Hold the line. Read the map. Choose the moment.",
        240
      ),
      motionPreset: choiceValue(raw.motionPreset, "embers", [
        "embers",
        "ink",
        "still",
      ] as const),
      theme: choiceValue(raw.theme, "stoic", [
        "royal",
        "chronicle",
        "stoic",
        "crimson",
        "midnight",
      ] as const),
      backgroundImageUrl,
      mobileBackgroundImageUrl,
      videoUrl,
      posterUrl,
      overlayOpacity: numberValue(raw.overlayOpacity, 0.62, 0, 1),
    };
  }

  if (type === "media_takeover") {
    return {
      eyebrow: stringValue(raw.eyebrow, "AOE2WAR PRESENTS", 100),
      title: stringValue(raw.title, "Main Stage", 180),
      subtitle: stringValue(raw.subtitle, "", 300),
      ctaLabel: stringValue(raw.ctaLabel, "Enter", 100),
      backgroundImageUrl,
      mobileBackgroundImageUrl,
      videoUrl,
      posterUrl,
      overlayOpacity: numberValue(raw.overlayOpacity, 0.45, 0, 1),
      theme: choiceValue(raw.theme, "midnight", [
        "royal",
        "chronicle",
        "stoic",
        "crimson",
        "midnight",
      ] as const),
    };
  }

  return {};
}

export const FALLBACK_HERO_PLAYLIST: HeroPlaylistView = {
  playlist: {
    id: 0,
    key: HERO_PLAYLIST_KEY,
    name: "Home + Lobby Main Stage",
    autoplay: false,
    defaultDurationMs: 9000,
    transitionDurationMs: 700,
    transitionStyle: "crossfade",
    pauseOnHover: true,
    showArrows: false,
    showDots: false,
    showProgress: false,
  },
  items: [
    {
      id: 0,
      position: 0,
      enabled: true,
      startsAt: null,
      endsAt: null,
      durationMs: null,
      hrefOverride: "",
      href: FALLBACK_EVENT_TILE.ctaUrl,
      screen: {
        id: 0,
        key: "featured-event-fallback",
        name: "Featured Event",
        type: "featured_event",
        status: "published",
        defaultHref: FALLBACK_EVENT_TILE.ctaUrl,
        ariaLabel: "Open the featured AoE2WAR event",
        eventTileId: null,
        forumThreadId: null,
        mediaAssetId: null,
        config: {},
        createdAt: "",
        updatedAt: "",
        eventTile: FALLBACK_EVENT_TILE,
        forumThread: null,
        mediaAsset: null,
      },
    },
  ],
  publishedVersion: null,
  publishedAt: null,
  source: "fallback",
};
