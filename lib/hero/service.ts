import type {
  EventTile,
  ForumThread,
  HeroPlaylist,
  HeroPlaylistItem,
  HeroPlaylistPublication,
  HeroScreen,
  ManagedMediaAsset,
  PrismaClient,
} from "@/lib/generated/prisma";
import { serializeEventTile } from "@/lib/events/service";
import type { EventTileView } from "@/lib/events/types";
import {
  FALLBACK_HERO_PLAYLIST,
  HERO_PLAYLIST_KEY,
  type HeroForumThreadSource,
  type HeroMediaAssetSource,
  type HeroPlaylistItemSnapshot,
  type HeroPlaylistSettings,
  type HeroPlaylistSnapshotData,
  type HeroPlaylistView,
  type HeroScreenDefinition,
  type HeroStudioSnapshot,
  isSafeHeroHref,
  normalizeHeroScreenConfig,
  normalizeHeroScreenStatus,
  normalizeHeroScreenType,
  normalizeHeroTransitionStyle,
} from "@/lib/hero/types";

type EventWithRelations = EventTile & {
  linkedTrophy: { displayName: string } | null;
  playerOne: { representedCountry: string | null } | null;
  playerTwo: { representedCountry: string | null } | null;
};

type PlaylistWithItems = HeroPlaylist & {
  items: Array<HeroPlaylistItem & { screen: HeroScreen }>;
};

const EVENT_INCLUDE = {
  linkedTrophy: { select: { displayName: true } },
  playerOne: { select: { representedCountry: true } },
  playerTwo: { select: { representedCountry: true } },
} as const;

const DEFAULT_PLAYLIST_DATA = {
  key: HERO_PLAYLIST_KEY,
  name: "Home + Lobby Main Stage",
  autoplay: true,
  defaultDurationMs: 9000,
  transitionDurationMs: 700,
  transitionStyle: "crossfade",
  pauseOnHover: true,
  showArrows: true,
  showDots: true,
  showProgress: true,
} as const;

function cleanText(value: unknown, fallback = "", max = 500) {
  return typeof value === "string"
    ? value.trim().slice(0, max) || fallback
    : fallback;
}

function intValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function dateString(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function playlistSettings(playlist: HeroPlaylist): HeroPlaylistSettings {
  return {
    id: playlist.id,
    key: playlist.key,
    name: playlist.name,
    autoplay: playlist.autoplay,
    defaultDurationMs: intValue(playlist.defaultDurationMs, 9000, 3000, 60000),
    transitionDurationMs: intValue(
      playlist.transitionDurationMs,
      700,
      0,
      3000
    ),
    transitionStyle: normalizeHeroTransitionStyle(playlist.transitionStyle),
    pauseOnHover: playlist.pauseOnHover,
    showArrows: playlist.showArrows,
    showDots: playlist.showDots,
    showProgress: playlist.showProgress,
  };
}

export function serializeHeroScreen(screen: HeroScreen): HeroScreenDefinition {
  const type = normalizeHeroScreenType(screen.type);
  return {
    id: screen.id,
    key: screen.key,
    name: screen.name,
    type,
    status: normalizeHeroScreenStatus(screen.status),
    defaultHref: cleanText(screen.defaultHref, "", 500),
    ariaLabel: cleanText(screen.ariaLabel, `Open ${screen.name}`, 180),
    eventTileId: screen.eventTileId,
    forumThreadId: screen.forumThreadId,
    mediaAssetId: screen.mediaAssetId,
    config: normalizeHeroScreenConfig(type, screen.config),
    createdAt: screen.createdAt.toISOString(),
    updatedAt: screen.updatedAt.toISOString(),
  };
}

export function serializeForumThreadSource(
  thread: Pick<
    ForumThread,
    | "id"
    | "slug"
    | "channel"
    | "tag"
    | "title"
    | "excerpt"
    | "authorLabel"
    | "authorRole"
    | "createdAt"
    | "updatedAt"
  >
): HeroForumThreadSource {
  return {
    id: thread.id,
    slug: thread.slug,
    channel: thread.channel,
    tag: thread.tag,
    title: thread.title,
    excerpt: thread.excerpt,
    authorLabel: thread.authorLabel || "AoE2WAR Scribe",
    authorRole: thread.authorRole || "House voice",
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

export function serializeMediaAssetSource(
  asset: ManagedMediaAsset
): HeroMediaAssetSource {
  return {
    id: asset.id,
    kind: asset.kind,
    target: asset.target,
    label: asset.label,
    url: asset.url,
    alt: asset.alt || asset.label,
    mimeType: asset.mimeType || "",
    sizeBytes: asset.sizeBytes,
    active: asset.active,
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function buildHeroSnapshot(
  playlist: PlaylistWithItems
): HeroPlaylistSnapshotData {
  return {
    playlist: playlistSettings(playlist),
    items: [...playlist.items]
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((item) => ({
        id: item.id,
        position: item.position,
        enabled: item.enabled,
        startsAt: item.startsAt?.toISOString() ?? null,
        endsAt: item.endsAt?.toISOString() ?? null,
        durationMs: item.durationMs,
        hrefOverride: cleanText(item.hrefOverride, "", 500),
        screen: serializeHeroScreen(item.screen),
      })),
  };
}

function normalizeScreenDefinition(value: unknown): HeroScreenDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = intValue(raw.id, 0, 1, 2_000_000_000);
  const type = normalizeHeroScreenType(raw.type);
  if (!id) return null;
  return {
    id,
    key: cleanText(raw.key, `hero-screen-${id}`, 120),
    name: cleanText(raw.name, "Hero Screen", 160),
    type,
    status: normalizeHeroScreenStatus(raw.status),
    defaultHref: cleanText(raw.defaultHref, "", 500),
    ariaLabel: cleanText(raw.ariaLabel, "Open Hero screen", 180),
    eventTileId: raw.eventTileId
      ? intValue(raw.eventTileId, 0, 1, 2_000_000_000) || null
      : null,
    forumThreadId: raw.forumThreadId
      ? intValue(raw.forumThreadId, 0, 1, 2_000_000_000) || null
      : null,
    mediaAssetId: raw.mediaAssetId
      ? intValue(raw.mediaAssetId, 0, 1, 2_000_000_000) || null
      : null,
    config: normalizeHeroScreenConfig(type, raw.config),
    createdAt: dateString(raw.createdAt) || "",
    updatedAt: dateString(raw.updatedAt) || "",
  };
}

export function normalizeHeroSnapshot(value: unknown): HeroPlaylistSnapshotData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const rawPlaylist =
    raw.playlist && typeof raw.playlist === "object" && !Array.isArray(raw.playlist)
      ? (raw.playlist as Record<string, unknown>)
      : null;
  if (!rawPlaylist) return null;
  const id = intValue(rawPlaylist.id, 0, 1, 2_000_000_000);
  if (!id) return null;
  const playlist: HeroPlaylistSettings = {
    id,
    key: cleanText(rawPlaylist.key, HERO_PLAYLIST_KEY, 100),
    name: cleanText(rawPlaylist.name, "Home + Lobby Main Stage", 160),
    autoplay: boolValue(rawPlaylist.autoplay, true),
    defaultDurationMs: intValue(
      rawPlaylist.defaultDurationMs,
      9000,
      3000,
      60000
    ),
    transitionDurationMs: intValue(
      rawPlaylist.transitionDurationMs,
      700,
      0,
      3000
    ),
    transitionStyle: normalizeHeroTransitionStyle(rawPlaylist.transitionStyle),
    pauseOnHover: boolValue(rawPlaylist.pauseOnHover, true),
    showArrows: boolValue(rawPlaylist.showArrows, true),
    showDots: boolValue(rawPlaylist.showDots, true),
    showProgress: boolValue(rawPlaylist.showProgress, true),
  };
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: HeroPlaylistItemSnapshot[] = rawItems.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const screen = normalizeScreenDefinition(item.screen);
    if (!screen) return [];
    const hrefOverride = cleanText(item.hrefOverride, "", 500);
    return [
      {
        id: intValue(item.id, screen.id, 0, 2_000_000_000),
        position: intValue(item.position, 0, 0, 10000),
        enabled: boolValue(item.enabled, true),
        startsAt: dateString(item.startsAt),
        endsAt: dateString(item.endsAt),
        durationMs: item.durationMs
          ? intValue(item.durationMs, 9000, 3000, 60000)
          : null,
        hrefOverride: isSafeHeroHref(hrefOverride) ? hrefOverride : "",
        screen,
      },
    ];
  });
  return { playlist, items };
}

function isItemInWindow(item: HeroPlaylistItemSnapshot, now: number) {
  const startsAt = item.startsAt ? new Date(item.startsAt).getTime() : null;
  const endsAt = item.endsAt ? new Date(item.endsAt).getTime() : null;
  return (
    (!startsAt || startsAt <= now) &&
    (!endsAt || endsAt > now)
  );
}

function defaultHrefForScreen(
  screen: HeroScreenDefinition,
  eventTile: EventTileView | null,
  forumThread: HeroForumThreadSource | null
) {
  if (screen.type === "featured_event") return eventTile?.ctaUrl || "/lobby";
  if (screen.defaultHref && isSafeHeroHref(screen.defaultHref)) {
    return screen.defaultHref;
  }
  if (screen.type === "chronicle_cover" && forumThread) {
    return `/forum/thread/${forumThread.slug}`;
  }
  return "/forum";
}

export async function hydrateHeroSnapshot(
  prisma: PrismaClient,
  snapshot: HeroPlaylistSnapshotData,
  meta: Pick<HeroPlaylistView, "publishedVersion" | "publishedAt" | "source">,
  includeInactive = false
): Promise<HeroPlaylistView> {
  const needsActiveEvent = snapshot.items.some(
    (item) => item.screen.type === "featured_event"
  );
  const threadIds = Array.from(
    new Set(snapshot.items.map((item) => item.screen.forumThreadId).filter(Boolean))
  ) as number[];
  const mediaIds = Array.from(
    new Set(snapshot.items.map((item) => item.screen.mediaAssetId).filter(Boolean))
  ) as number[];

  const [activeEvent, threads, media] = await Promise.all([
    needsActiveEvent
      ? prisma.eventTile.findFirst({
          where: {
            isPublished: true,
            isActive: true,
            status: { not: "archived" },
          },
          include: EVENT_INCLUDE,
          orderBy: [
            { priority: "desc" },
            { publishedAt: "desc" },
            { updatedAt: "desc" },
          ],
        })
      : Promise.resolve(null as EventWithRelations | null),
    threadIds.length
      ? prisma.forumThread.findMany({ where: { id: { in: threadIds } } })
      : Promise.resolve([] as ForumThread[]),
    mediaIds.length
      ? prisma.managedMediaAsset.findMany({ where: { id: { in: mediaIds } } })
      : Promise.resolve([] as ManagedMediaAsset[]),
  ]);

  const activeEventTile = activeEvent
    ? serializeEventTile(activeEvent as EventWithRelations)
    : null;
  const threadsById = new Map(
    threads.map((thread) => [thread.id, serializeForumThreadSource(thread)])
  );
  const mediaById = new Map(
    media.map((asset) => [asset.id, serializeMediaAssetSource(asset)])
  );
  const now = Date.now();
  const items = snapshot.items
    .filter((item) => includeInactive || (item.enabled && isItemInWindow(item, now)))
    .sort((a, b) => a.position - b.position || a.id - b.id)
    .flatMap((item) => {
      const eventTile =
        item.screen.type === "featured_event" ? activeEventTile : null;
      const forumThread = item.screen.forumThreadId
        ? threadsById.get(item.screen.forumThreadId) || null
        : null;
      const mediaAsset = item.screen.mediaAssetId
        ? mediaById.get(item.screen.mediaAssetId) || null
        : null;
      if (!includeInactive && item.screen.status === "archived") return [];
      if (!includeInactive && item.screen.type === "featured_event" && !eventTile) {
        return [];
      }
      if (!includeInactive && item.screen.type === "chronicle_cover" && !forumThread) {
        return [];
      }
      const href =
        item.screen.type === "featured_event"
          ? eventTile?.ctaUrl || "/lobby"
          : item.hrefOverride && isSafeHeroHref(item.hrefOverride)
            ? item.hrefOverride
            : defaultHrefForScreen(item.screen, eventTile, forumThread);
      return [
        {
          ...item,
          href,
          screen: {
            ...item.screen,
            eventTile,
            forumThread,
            mediaAsset,
          },
        },
      ];
    });

  return {
    playlist: snapshot.playlist,
    items,
    ...meta,
  };
}

async function loadDraftPlaylist(prisma: PrismaClient) {
  return prisma.heroPlaylist.findUnique({
    where: { key: HERO_PLAYLIST_KEY },
    include: {
      items: {
        include: { screen: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
    },
  });
}

export async function ensureHeroPlaylist(prisma: PrismaClient) {
  return prisma.heroPlaylist.upsert({
    where: { key: HERO_PLAYLIST_KEY },
    create: DEFAULT_PLAYLIST_DATA,
    update: {},
  });
}

export async function loadPublishedHeroPlaylist(
  prisma: PrismaClient
): Promise<HeroPlaylistView> {
  try {
    const playlist = await loadDraftPlaylist(prisma);
    if (!playlist) return FALLBACK_HERO_PLAYLIST;
    const publication = await prisma.heroPlaylistPublication.findFirst({
      where: { playlistId: playlist.id },
      orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
    });
    const snapshot = publication
      ? normalizeHeroSnapshot(publication.snapshot)
      : buildHeroSnapshot(playlist);
    if (!snapshot) return FALLBACK_HERO_PLAYLIST;
    const hydrated = await hydrateHeroSnapshot(prisma, snapshot, {
      publishedVersion: publication?.version ?? null,
      publishedAt: publication?.publishedAt.toISOString() ?? null,
      source: publication ? "publication" : "draft-bootstrap",
    });
    return hydrated.items.length ? hydrated : FALLBACK_HERO_PLAYLIST;
  } catch (error) {
    console.warn("Published Hero playlist unavailable; using Featured Event fallback:", error);
    return FALLBACK_HERO_PLAYLIST;
  }
}

export async function loadHeroStudioSnapshot(
  prisma: PrismaClient
): Promise<HeroStudioSnapshot> {
  await ensureHeroPlaylist(prisma);
  const playlist = await loadDraftPlaylist(prisma);
  if (!playlist) throw new Error("Hero playlist is unavailable.");
  const [screens, eventTiles, forumThreads, mediaAssets, publications] =
    await Promise.all([
      prisma.heroScreen.findMany({
        where: {
          NOT: {
            key: { startsWith: "page-hero-" },
          },
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { id: "desc" }],
        take: 300,
      }),
      prisma.eventTile.findMany({
        include: EVENT_INCLUDE,
        orderBy: [
          { isActive: "desc" },
          { isPublished: "desc" },
          { updatedAt: "desc" },
        ],
        take: 150,
      }),
      prisma.forumThread.findMany({
        orderBy: [
          { isFeatured: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: 250,
      }),
      prisma.managedMediaAsset.findMany({
        where: { active: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 1200,
      }),
      prisma.heroPlaylistPublication.findMany({
        where: { playlistId: playlist.id },
        orderBy: [{ version: "desc" }, { publishedAt: "desc" }],
        take: 12,
      }),
    ]);
  const draftSnapshot = buildHeroSnapshot(playlist);
  const draft = await hydrateHeroSnapshot(
    prisma,
    draftSnapshot,
    {
      publishedVersion: publications[0]?.version ?? null,
      publishedAt: publications[0]?.publishedAt.toISOString() ?? null,
      source: "draft-bootstrap",
    },
    true
  );
  return {
    draft,
    screens: screens.map(serializeHeroScreen),
    eventTiles: eventTiles.map((event) =>
      serializeEventTile(event as EventWithRelations)
    ),
    forumThreads: forumThreads.map(serializeForumThreadSource),
    mediaAssets: mediaAssets.map(serializeMediaAssetSource),
    publications: publications.map((publication: HeroPlaylistPublication) => ({
      id: publication.id,
      version: publication.version,
      publishedByUid: publication.publishedByUid,
      publishedAt: publication.publishedAt.toISOString(),
    })),
    liveVersion: publications[0]?.version ?? null,
    generatedAt: new Date().toISOString(),
  };
}
