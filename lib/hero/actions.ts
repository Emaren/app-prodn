import type { PrismaClient } from "@/lib/generated/prisma";
import {
  HERO_PLAYLIST_KEY,
  HERO_SCREEN_STATUSES,
  HERO_SCREEN_TYPES,
  HERO_TRANSITION_STYLES,
  type HeroScreenStatus,
  type HeroScreenType,
  isSafeHeroHref,
  normalizeHeroScreenConfig,
} from "@/lib/hero/types";
import {
  buildHeroSnapshot,
  ensureHeroPlaylist,
} from "@/lib/hero/service";

export class HeroStudioActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "HeroStudioActionError";
    this.status = status;
  }
}

type Payload = Record<string, unknown>;

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function intValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.round(parsed)))
    : fallback;
}

function nullableInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function slug(value: unknown, fallback: string) {
  return (text(value, 160) || fallback)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function screenType(value: unknown): HeroScreenType {
  const parsed = text(value, 40) as HeroScreenType;
  return HERO_SCREEN_TYPES.includes(parsed) ? parsed : "warrior_quote";
}

function screenStatus(value: unknown): HeroScreenStatus {
  const parsed = text(value, 24) as HeroScreenStatus;
  return HERO_SCREEN_STATUSES.includes(parsed) ? parsed : "draft";
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HeroStudioActionError("Hero schedule dates must be valid.");
  }
  return parsed;
}

function hrefValue(value: unknown, required = false) {
  const parsed = text(value, 500);
  if (!parsed && !required) return null;
  if (!parsed || !isSafeHeroHref(parsed)) {
    throw new HeroStudioActionError(
      "Hero links must use an internal /path or a safe https:// URL."
    );
  }
  return parsed;
}

async function getPlaylist(prisma: PrismaClient) {
  await ensureHeroPlaylist(prisma);
  const playlist = await prisma.heroPlaylist.findUnique({
    where: { key: HERO_PLAYLIST_KEY },
  });
  if (!playlist) throw new HeroStudioActionError("Hero playlist not found.", 404);
  return playlist;
}

async function getScreen(prisma: PrismaClient, payload: Payload) {
  const id = nullableInt(payload.id);
  if (!id) throw new HeroStudioActionError("Choose a Hero screen.");
  const screen = await prisma.heroScreen.findUnique({ where: { id } });
  if (!screen) throw new HeroStudioActionError("Hero screen not found.", 404);
  return screen;
}

function validateScreenSource(
  type: HeroScreenType,
  eventTileId: number | null,
  forumThreadId: number | null
) {
  if (type === "featured_event" && !eventTileId) {
    throw new HeroStudioActionError(
      "Featured Event screens must reference an Event Studio tile."
    );
  }
  if (type === "chronicle_cover" && !forumThreadId) {
    throw new HeroStudioActionError(
      "Chronicle screens must reference a War Room dispatch."
    );
  }
}

async function savePlaylist(prisma: PrismaClient, payload: Payload) {
  const playlist = await getPlaylist(prisma);
  const transitionStyle = text(payload.transitionStyle, 40);
  if (!HERO_TRANSITION_STYLES.includes(transitionStyle as never)) {
    throw new HeroStudioActionError("Choose a supported Hero transition.");
  }
  return prisma.heroPlaylist.update({
    where: { id: playlist.id },
    data: {
      name: text(payload.name, 160) || playlist.name,
      autoplay: boolValue(payload.autoplay, playlist.autoplay),
      defaultDurationMs: intValue(
        payload.defaultDurationMs,
        playlist.defaultDurationMs,
        3000,
        60000
      ),
      transitionDurationMs: intValue(
        payload.transitionDurationMs,
        playlist.transitionDurationMs,
        0,
        3000
      ),
      transitionStyle,
      pauseOnHover: boolValue(payload.pauseOnHover, playlist.pauseOnHover),
      showArrows: boolValue(payload.showArrows, playlist.showArrows),
      showDots: boolValue(payload.showDots, playlist.showDots),
      showProgress: boolValue(payload.showProgress, playlist.showProgress),
    },
  });
}

async function saveScreen(prisma: PrismaClient, payload: Payload) {
  const id = nullableInt(payload.id);
  const name = text(payload.name, 160);
  const type = screenType(payload.type);
  const key = slug(payload.key, slug(name, `hero-screen-${Date.now()}`));
  if (!name || !key) {
    throw new HeroStudioActionError("Hero screen name and key are required.");
  }
  const eventTileId = nullableInt(payload.eventTileId);
  const forumThreadId = nullableInt(payload.forumThreadId);
  const mediaAssetId = nullableInt(payload.mediaAssetId);
  validateScreenSource(type, eventTileId, forumThreadId);
  let config;
  try {
    config = normalizeHeroScreenConfig(type, payload.config);
  } catch (error) {
    throw new HeroStudioActionError(
      error instanceof Error ? error.message : "Hero screen configuration is invalid."
    );
  }
  const data = {
    key,
    name,
    type,
    status: screenStatus(payload.status),
    defaultHref: hrefValue(payload.defaultHref),
    ariaLabel: text(payload.ariaLabel, 180) || null,
    eventTileId: type === "featured_event" ? eventTileId : null,
    forumThreadId: type === "chronicle_cover" ? forumThreadId : null,
    mediaAssetId,
    config,
  };
  try {
    return id
      ? await prisma.heroScreen.update({ where: { id }, data })
      : await prisma.heroScreen.create({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unique constraint")) {
      throw new HeroStudioActionError("Hero screen keys must be unique.");
    }
    throw error;
  }
}

async function duplicateScreen(prisma: PrismaClient, payload: Payload) {
  const screen = await getScreen(prisma, payload);
  let suffix = 2;
  let key = `${screen.key}-copy`;
  while (await prisma.heroScreen.findUnique({ where: { key }, select: { id: true } })) {
    key = `${screen.key}-copy-${suffix}`;
    suffix += 1;
  }
  return prisma.heroScreen.create({
    data: {
      key,
      name: `${screen.name} Copy`,
      type: screen.type,
      status: "draft",
      defaultHref: screen.defaultHref,
      ariaLabel: screen.ariaLabel,
      eventTileId: screen.eventTileId,
      forumThreadId: screen.forumThreadId,
      mediaAssetId: screen.mediaAssetId,
      config: screen.config ?? undefined,
    },
  });
}

async function archiveScreen(prisma: PrismaClient, payload: Payload) {
  const screen = await getScreen(prisma, payload);
  return prisma.$transaction(async (tx) => {
    await tx.heroPlaylistItem.deleteMany({ where: { screenId: screen.id } });
    return tx.heroScreen.update({
      where: { id: screen.id },
      data: { status: "archived" },
    });
  });
}

async function saveItems(prisma: PrismaClient, payload: Payload) {
  const playlist = await getPlaylist(prisma);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length > 50) {
    throw new HeroStudioActionError("Keep the Hero chain to 50 screens or fewer.");
  }
  const parsed = rawItems.map((entry, position) => {
    const item =
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const screenId = nullableInt(item.screenId);
    if (!screenId) throw new HeroStudioActionError("Every Hero item needs a screen.");
    const startsAt = dateValue(item.startsAt);
    const endsAt = dateValue(item.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) {
      throw new HeroStudioActionError("A Hero screen must end after it starts.");
    }
    return {
      screenId,
      position,
      enabled: boolValue(item.enabled, true),
      startsAt,
      endsAt,
      durationMs: item.durationMs
        ? intValue(item.durationMs, 9000, 3000, 60000)
        : null,
      hrefOverride: hrefValue(item.hrefOverride),
    };
  });
  if (new Set(parsed.map((item) => item.screenId)).size !== parsed.length) {
    throw new HeroStudioActionError("A Hero screen can appear only once in this chain.");
  }
  const existing = parsed.length
    ? await prisma.heroScreen.findMany({
        where: { id: { in: parsed.map((item) => item.screenId) } },
        select: { id: true },
      })
    : [];
  if (existing.length !== parsed.length) {
    throw new HeroStudioActionError("One or more Hero screens no longer exist.");
  }
  return prisma.$transaction(async (tx) => {
    await tx.heroPlaylistItem.deleteMany({
      where: {
        playlistId: playlist.id,
        ...(parsed.length
          ? { screenId: { notIn: parsed.map((item) => item.screenId) } }
          : {}),
      },
    });
    if (!parsed.length) {
      await tx.heroPlaylistItem.deleteMany({ where: { playlistId: playlist.id } });
      return playlist;
    }
    for (const item of parsed) {
      await tx.heroPlaylistItem.upsert({
        where: {
          playlistId_screenId: {
            playlistId: playlist.id,
            screenId: item.screenId,
          },
        },
        create: { playlistId: playlist.id, ...item },
        update: item,
      });
    }
    return playlist;
  });
}

function validatePublishSnapshot(
  snapshot: ReturnType<typeof buildHeroSnapshot>
) {
  const active = snapshot.items.filter(
    (item) => item.enabled && item.screen.status !== "archived"
  );
  if (!active.length) {
    throw new HeroStudioActionError(
      "Publish requires at least one enabled, non-archived Hero screen."
    );
  }
  for (const item of active) {
    validateScreenSource(
      item.screen.type,
      item.screen.eventTileId,
      item.screen.forumThreadId
    );
  }
}

async function publishPlaylist(
  prisma: PrismaClient,
  publishedByUid: string | null
) {
  const playlist = await getPlaylist(prisma);
  return prisma.$transaction(async (tx) => {
    const draft = await tx.heroPlaylist.findUnique({
      where: { id: playlist.id },
      include: {
        items: {
          include: { screen: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!draft) throw new HeroStudioActionError("Hero playlist not found.", 404);
    const screenIds = draft.items.map((item) => item.screenId);
    if (screenIds.length) {
      await tx.heroScreen.updateMany({
        where: { id: { in: screenIds }, status: "draft" },
        data: { status: "published" },
      });
    }
    const refreshed = await tx.heroPlaylist.findUnique({
      where: { id: playlist.id },
      include: {
        items: {
          include: { screen: true },
          orderBy: [{ position: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!refreshed) throw new HeroStudioActionError("Hero playlist not found.", 404);
    const snapshot = buildHeroSnapshot(refreshed);
    validatePublishSnapshot(snapshot);
    const latest = await tx.heroPlaylistPublication.findFirst({
      where: { playlistId: playlist.id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return tx.heroPlaylistPublication.create({
      data: {
        playlistId: playlist.id,
        version: (latest?.version ?? 0) + 1,
        snapshot: JSON.parse(JSON.stringify(snapshot)),
        publishedByUid,
      },
    });
  });
}

async function rollbackPlaylist(
  prisma: PrismaClient,
  payload: Payload,
  publishedByUid: string | null
) {
  const playlist = await getPlaylist(prisma);
  const publicationId = nullableInt(payload.publicationId);
  if (!publicationId) {
    throw new HeroStudioActionError("Choose a Hero publication to restore.");
  }
  const source = await prisma.heroPlaylistPublication.findFirst({
    where: { id: publicationId, playlistId: playlist.id },
  });
  if (!source) throw new HeroStudioActionError("Hero publication not found.", 404);
  const latest = await prisma.heroPlaylistPublication.findFirst({
    where: { playlistId: playlist.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return prisma.heroPlaylistPublication.create({
    data: {
      playlistId: playlist.id,
      version: (latest?.version ?? 0) + 1,
      snapshot: JSON.parse(JSON.stringify(source.snapshot)),
      publishedByUid,
    },
  });
}

export async function executeHeroStudioAction(
  prisma: PrismaClient,
  payload: Payload,
  actorUid: string | null
) {
  const action = text(payload.action, 40);
  if (action === "save_playlist") return savePlaylist(prisma, payload);
  if (action === "save_screen") return saveScreen(prisma, payload);
  if (action === "duplicate_screen") return duplicateScreen(prisma, payload);
  if (action === "archive_screen") return archiveScreen(prisma, payload);
  if (action === "save_items") return saveItems(prisma, payload);
  if (action === "publish_playlist") return publishPlaylist(prisma, actorUid);
  if (action === "rollback_playlist") {
    return rollbackPlaylist(prisma, payload, actorUid);
  }
  throw new HeroStudioActionError("Unsupported Hero Studio action.");
}
