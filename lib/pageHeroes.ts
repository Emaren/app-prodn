import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";

export const PAGE_HERO_VIEWS = ["basic", "advanced", "extreme"] as const;
export type PageHeroView = (typeof PAGE_HERO_VIEWS)[number];

export type PageHeroSurface = {
  key: string;
  label: string;
  route: string;
  wired: boolean;
  description: string;
};

export const PAGE_HERO_SURFACES: readonly PageHeroSurface[] = [
  {
    key: "game-stats",
    label: "Parser Observatory",
    route: "/game-stats",
    wired: true,
    description: "Public parser truth, archive recovery, and identity evidence.",
  },
  {
    key: "workshop",
    label: "The Workshop",
    route: "/workshop",
    wired: false,
    description: "Build culture and Chronicle production state.",
  },
  {
    key: "market",
    label: "Marketplace",
    route: "/market",
    wired: false,
    description: "WOLO commerce and Kingdom market surfaces.",
  },
  {
    key: "academy",
    label: "The Academy",
    route: "/academy",
    wired: false,
    description: "Learning, strategy, and institutional knowledge.",
  },
  {
    key: "clans",
    label: "Clan Halls",
    route: "/clans",
    wired: false,
    description: "Warhouses, banners, and clan culture.",
  },
  {
    key: "kingdom",
    label: "The Kingdom",
    route: "/kingdom",
    wired: false,
    description: "AoE2WAR's Kingdom landing surface.",
  },
  {
    key: "oracle",
    label: "The Oracle",
    route: "/oracle",
    wired: false,
    description: "Prediction markets and growth wagers.",
  },
  {
    key: "staking",
    label: "Staking",
    route: "/staking",
    wired: false,
    description: "WOLO staking and long-horizon Kingdom participation.",
  },
  {
    key: "players",
    label: "Players",
    route: "/players",
    wired: false,
    description: "Warrior discovery and player identity.",
  },
  {
    key: "bets",
    label: "Betting Hall",
    route: "/bets",
    wired: false,
    description: "Live books, wager proof, and settlement rails.",
  },
  {
    key: "live-games",
    label: "Live Games",
    route: "/live-games",
    wired: false,
    description: "Watcher-confirmed games and recent battle records.",
  },
] as const;

const PAGE_HERO_SURFACE_BY_KEY = new Map(
  PAGE_HERO_SURFACES.map((surface) => [surface.key, surface])
);

export type PageHeroAsset = {
  id: number;
  label: string;
  url: string;
  alt: string;
  active: boolean;
  sizeBytes: number;
  updatedAt: string;
};

export type PageHeroChainItem = {
  id: number;
  position: number;
  enabled: boolean;
  durationMs: number | null;
  views: PageHeroView[];
  focalX: number;
  focalY: number;
  overlayOpacity: number;
  asset: PageHeroAsset | null;
};

export type PageHeroChain = {
  surface: PageHeroSurface;
  playlist: {
    id: number | null;
    autoplay: boolean;
    defaultDurationMs: number;
    transitionDurationMs: number;
  };
  items: PageHeroChainItem[];
};

export type PageHeroAdminSnapshot = {
  surfaces: readonly PageHeroSurface[];
  selectedSurface: PageHeroSurface;
  library: PageHeroAsset[];
  chain: PageHeroChain;
};

const DEFAULT_DURATION_MS = 12000;
const DEFAULT_TRANSITION_MS = 2200;

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function configObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeViews(value: unknown): PageHeroView[] {
  const values = Array.isArray(value) ? value : [];
  const normalized = PAGE_HERO_VIEWS.filter((view) => values.includes(view));
  return normalized.length ? [...normalized] : [...PAGE_HERO_VIEWS];
}

function serializeAsset(asset: {
  id: number;
  label: string;
  url: string;
  alt: string | null;
  active: boolean;
  sizeBytes: number;
  updatedAt: Date;
}): PageHeroAsset {
  return {
    id: asset.id,
    label: asset.label,
    url: asset.url,
    alt: asset.alt || asset.label,
    active: asset.active,
    sizeBytes: asset.sizeBytes,
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function normalizePageHeroView(
  value: string | string[] | null | undefined
): PageHeroView {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = String(raw || "").trim().toLowerCase();

  if (normalized === "b" || normalized === "basic") return "basic";
  if (normalized === "e" || normalized === "extreme") return "extreme";
  return "advanced";
}

export function normalizePageHeroSurface(value: unknown) {
  const key = String(value || "").trim().toLowerCase();
  return PAGE_HERO_SURFACE_BY_KEY.get(key) || PAGE_HERO_SURFACES[0];
}

export function pageHeroPlaylistKey(surface: string) {
  return `page-hero-${normalizePageHeroSurface(surface).key}`;
}

function defaultChain(surface: PageHeroSurface): PageHeroChain {
  return {
    surface,
    playlist: {
      id: null,
      autoplay: true,
      defaultDurationMs: DEFAULT_DURATION_MS,
      transitionDurationMs: DEFAULT_TRANSITION_MS,
    },
    items: [],
  };
}

async function readPageHeroChain(
  prisma: PrismaClient,
  surfaceInput: string,
  includeDisabled: boolean
): Promise<PageHeroChain> {
  const surface = normalizePageHeroSurface(surfaceInput);
  const playlist = await prisma.heroPlaylist.findUnique({
    where: { key: pageHeroPlaylistKey(surface.key) },
    include: {
      items: {
        include: {
          screen: {
            include: {
              mediaAsset: true,
            },
          },
        },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!playlist) return defaultChain(surface);

  const now = Date.now();
  const items = playlist.items.flatMap((item) => {
    const asset = item.screen.mediaAsset;
    const config = configObject(item.screen.config);
    const startsAt = item.startsAt?.getTime() ?? null;
    const endsAt = item.endsAt?.getTime() ?? null;
    const inWindow = (!startsAt || startsAt <= now) && (!endsAt || endsAt > now);

    if (!includeDisabled) {
      if (!item.enabled || !inWindow) return [];
      if (!asset?.active || item.screen.status === "archived") return [];
    }

    return [
      {
        id: item.id,
        position: item.position,
        enabled: item.enabled,
        durationMs: item.durationMs,
        views: normalizeViews(config.views),
        focalX: clampNumber(config.focalX, 50, 0, 100),
        focalY: clampNumber(config.focalY, 50, 0, 100),
        overlayOpacity: clampNumber(config.overlayOpacity, 0.12, 0, 0.6),
        asset: asset ? serializeAsset(asset) : null,
      },
    ];
  });

  return {
    surface,
    playlist: {
      id: playlist.id,
      autoplay: playlist.autoplay,
      defaultDurationMs: playlist.defaultDurationMs,
      transitionDurationMs: playlist.transitionDurationMs,
    },
    items,
  };
}

export async function loadPageHeroChain(
  surfaceInput: string,
  viewInput?: PageHeroView
): Promise<PageHeroChain> {
  const prisma = getPrisma();
  const chain = await readPageHeroChain(prisma, surfaceInput, false);

  if (!viewInput) return chain;

  return {
    ...chain,
    items: chain.items.filter((item) => item.views.includes(viewInput)),
  };
}

export async function loadPageHeroAdminSnapshot(
  prisma: PrismaClient,
  surfaceInput: string
): Promise<PageHeroAdminSnapshot> {
  const selectedSurface = normalizePageHeroSurface(surfaceInput);
  const [chain, assets] = await Promise.all([
    readPageHeroChain(prisma, selectedSurface.key, true),
    prisma.managedMediaAsset.findMany({
      where: {
        kind: "hero",
        target: null,
      },
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 1200,
    }),
  ]);

  return {
    surfaces: PAGE_HERO_SURFACES,
    selectedSurface,
    library: assets.map(serializeAsset),
    chain,
  };
}

export async function ensurePageHeroPlaylist(
  prisma: PrismaClient,
  surfaceInput: string
) {
  const surface = normalizePageHeroSurface(surfaceInput);
  return prisma.heroPlaylist.upsert({
    where: { key: pageHeroPlaylistKey(surface.key) },
    create: {
      key: pageHeroPlaylistKey(surface.key),
      name: `${surface.label} Hero Chain`,
      autoplay: true,
      defaultDurationMs: DEFAULT_DURATION_MS,
      transitionDurationMs: DEFAULT_TRANSITION_MS,
      transitionStyle: "crossfade",
      pauseOnHover: false,
      showArrows: false,
      showDots: false,
      showProgress: false,
    },
    update: {},
  });
}

function defaultScreenConfig(): Prisma.InputJsonValue {
  return {
    pageHero: true,
    views: [...PAGE_HERO_VIEWS],
    focalX: 50,
    focalY: 50,
    overlayOpacity: 0.12,
  };
}

export async function assignPageHeroAssets(
  prisma: PrismaClient,
  surfaceInput: string,
  assetIds: number[]
) {
  const surface = normalizePageHeroSurface(surfaceInput);
  const playlist = await ensurePageHeroPlaylist(prisma, surface.key);
  const uniqueIds = Array.from(
    new Set(assetIds.filter((id) => Number.isInteger(id) && id > 0))
  );

  if (!uniqueIds.length) {
    throw new Error("Choose one or more Hero Images first.");
  }

  const assets = await prisma.managedMediaAsset.findMany({
    where: {
      id: { in: uniqueIds },
      kind: "hero",
      target: null,
      active: true,
    },
    orderBy: [{ id: "asc" }],
  });

  if (!assets.length) {
    throw new Error("No active Hero Images were found for that selection.");
  }

  const lastItem = await prisma.heroPlaylistItem.findFirst({
    where: { playlistId: playlist.id },
    orderBy: [{ position: "desc" }, { id: "desc" }],
    select: { position: true },
  });

  let position = (lastItem?.position ?? -10) + 10;

  await prisma.$transaction(async (tx) => {
    for (const asset of assets) {
      const screenKey = `page-hero-${surface.key}-${asset.id}`.slice(0, 120);
      const existingScreen = await tx.heroScreen.findUnique({
        where: { key: screenKey },
      });

      const screen = existingScreen
        ? await tx.heroScreen.update({
            where: { id: existingScreen.id },
            data: {
              name: `${surface.label} · ${asset.label}`.slice(0, 160),
              type: "media_takeover",
              status: "published",
              mediaAssetId: asset.id,
              ariaLabel: `${surface.label} Hero · ${asset.label}`.slice(0, 180),
            },
          })
        : await tx.heroScreen.create({
            data: {
              key: screenKey,
              name: `${surface.label} · ${asset.label}`.slice(0, 160),
              type: "media_takeover",
              status: "published",
              mediaAssetId: asset.id,
              ariaLabel: `${surface.label} Hero · ${asset.label}`.slice(0, 180),
              config: defaultScreenConfig(),
            },
          });

      const existingItem = await tx.heroPlaylistItem.findFirst({
        where: {
          playlistId: playlist.id,
          screenId: screen.id,
        },
        select: { id: true },
      });

      if (!existingItem) {
        await tx.heroPlaylistItem.create({
          data: {
            playlistId: playlist.id,
            screenId: screen.id,
            position,
            enabled: true,
          },
        });
        position += 10;
      }
    }
  });

  return loadPageHeroAdminSnapshot(prisma, surface.key);
}

export async function updatePageHeroSettings(
  prisma: PrismaClient,
  surfaceInput: string,
  input: Record<string, unknown>
) {
  const playlist = await ensurePageHeroPlaylist(prisma, surfaceInput);

  await prisma.heroPlaylist.update({
    where: { id: playlist.id },
    data: {
      autoplay:
        typeof input.autoplay === "boolean" ? input.autoplay : playlist.autoplay,
      defaultDurationMs: Math.round(
        clampNumber(input.defaultDurationMs, playlist.defaultDurationMs, 4000, 60000)
      ),
      transitionDurationMs: Math.round(
        clampNumber(input.transitionDurationMs, playlist.transitionDurationMs, 0, 5000)
      ),
      transitionStyle: "crossfade",
      pauseOnHover: false,
      showArrows: false,
      showDots: false,
      showProgress: false,
    },
  });

  return loadPageHeroAdminSnapshot(prisma, surfaceInput);
}

export async function updatePageHeroItem(
  prisma: PrismaClient,
  surfaceInput: string,
  itemId: number,
  input: Record<string, unknown>
) {
  const surface = normalizePageHeroSurface(surfaceInput);
  const playlist = await ensurePageHeroPlaylist(prisma, surface.key);
  const item = await prisma.heroPlaylistItem.findFirst({
    where: {
      id: itemId,
      playlistId: playlist.id,
    },
    include: { screen: true },
  });

  if (!item) throw new Error("Hero chain item not found.");

  const currentConfig = configObject(item.screen.config);
  const nextViews = Array.isArray(input.views)
    ? normalizeViews(input.views)
    : normalizeViews(currentConfig.views);
  const nextConfig: Prisma.InputJsonValue = {
    pageHero: true,
    views: nextViews,
    focalX: clampNumber(
      input.focalX,
      clampNumber(currentConfig.focalX, 50, 0, 100),
      0,
      100
    ),
    focalY: clampNumber(
      input.focalY,
      clampNumber(currentConfig.focalY, 50, 0, 100),
      0,
      100
    ),
    overlayOpacity: clampNumber(
      input.overlayOpacity,
      clampNumber(currentConfig.overlayOpacity, 0.12, 0, 0.6),
      0,
      0.6
    ),
  };

  await prisma.$transaction([
    prisma.heroPlaylistItem.update({
      where: { id: item.id },
      data: {
        enabled:
          typeof input.enabled === "boolean" ? input.enabled : item.enabled,
        durationMs:
          input.durationMs === null || input.durationMs === ""
            ? null
            : Math.round(
                clampNumber(
                  input.durationMs,
                  item.durationMs ?? playlist.defaultDurationMs,
                  4000,
                  60000
                )
              ),
      },
    }),
    prisma.heroScreen.update({
      where: { id: item.screenId },
      data: { config: nextConfig },
    }),
  ]);

  return loadPageHeroAdminSnapshot(prisma, surface.key);
}

export async function reorderPageHeroItems(
  prisma: PrismaClient,
  surfaceInput: string,
  itemIds: number[]
) {
  const playlist = await ensurePageHeroPlaylist(prisma, surfaceInput);
  const existing = await prisma.heroPlaylistItem.findMany({
    where: { playlistId: playlist.id },
    select: { id: true },
  });
  const existingIds = existing.map((item) => item.id).sort((a, b) => a - b);
  const requestedIds = Array.from(new Set(itemIds)).sort((a, b) => a - b);

  if (
    existingIds.length !== requestedIds.length ||
    existingIds.some((id, index) => id !== requestedIds[index])
  ) {
    throw new Error(
      "Hero reorder must include every item in the current chain exactly once."
    );
  }

  await prisma.$transaction(
    itemIds.map((id, index) =>
      prisma.heroPlaylistItem.update({
        where: { id },
        data: { position: index * 10 },
      })
    )
  );

  return loadPageHeroAdminSnapshot(prisma, surfaceInput);
}

export async function removePageHeroItem(
  prisma: PrismaClient,
  surfaceInput: string,
  itemId: number
) {
  const playlist = await ensurePageHeroPlaylist(prisma, surfaceInput);
  const item = await prisma.heroPlaylistItem.findFirst({
    where: { id: itemId, playlistId: playlist.id },
    select: { id: true },
  });

  if (!item) throw new Error("Hero chain item not found.");
  await prisma.heroPlaylistItem.delete({ where: { id: item.id } });
  return loadPageHeroAdminSnapshot(prisma, surfaceInput);
}
