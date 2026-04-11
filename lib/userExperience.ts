import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  DEFAULT_LOBBY_TEXT_COLOR,
  DEFAULT_LOBBY_TILE_THEME,
  DEFAULT_LOBBY_THEME,
  DEFAULT_LOBBY_VIEW,
  isLobbyTextColor,
  isLobbyThemeKey,
  isLobbyViewMode,
  type LobbyTextColor,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import {
  DEFAULT_TIME_DISPLAY_MODE,
  isTimeDisplayMode,
  normalizeTimezoneOverride,
  type TimeDisplayMode,
} from "@/lib/timeDisplay";

export type StoredAppearancePreference = {
  themeKey: LobbyThemeKey;
  tileThemeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  textColor: LobbyTextColor;
  timeDisplayMode: TimeDisplayMode;
  timezoneOverride: string | null;
  updatedAt: string | null;
};

export type UserActivityEntry = {
  id: number;
  type: string;
  path: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type ActivityDbClient = PrismaClient | Prisma.TransactionClient;

export function normalizeActivityType(value: string) {
  return value.trim().replace(/\s+/g, "_").toLowerCase().slice(0, 40);
}

export function normalizeActivityPath(value: string | null | undefined) {
  if (!value) return null;
  return value.trim().slice(0, 160) || null;
}

export function normalizeActivityLabel(value: string | null | undefined) {
  if (!value) return null;
  return value.trim().replace(/\s+/g, " ").slice(0, 80) || null;
}

export function normalizeAppearancePreference(input: {
  themeKey?: string | null;
  tileThemeKey?: string | null;
  viewMode?: string | null;
  textColor?: string | null;
  timeDisplayMode?: string | null;
  timezoneOverride?: string | null;
}) {
  const rawThemeKey = input.themeKey ?? null;
  const rawTileThemeKey = input.tileThemeKey ?? null;
  const rawViewMode = input.viewMode ?? null;
  const rawTextColor = input.textColor ?? null;
  const rawTimeDisplayMode = input.timeDisplayMode ?? null;
  const rawTimezoneOverride = input.timezoneOverride ?? null;
  const themeKey: LobbyThemeKey = isLobbyThemeKey(rawThemeKey)
    ? rawThemeKey
    : DEFAULT_LOBBY_THEME;
  const tileThemeKey: LobbyThemeKey = isLobbyThemeKey(rawTileThemeKey)
    ? rawTileThemeKey
    : DEFAULT_LOBBY_TILE_THEME;
  const viewMode: LobbyViewMode = isLobbyViewMode(rawViewMode)
    ? rawViewMode
    : DEFAULT_LOBBY_VIEW;
  const textColor: LobbyTextColor = isLobbyTextColor(rawTextColor)
    ? rawTextColor
    : DEFAULT_LOBBY_TEXT_COLOR;
  const timeDisplayMode: TimeDisplayMode = isTimeDisplayMode(rawTimeDisplayMode)
    ? rawTimeDisplayMode
    : DEFAULT_TIME_DISPLAY_MODE;
  const timezoneOverride = normalizeTimezoneOverride(rawTimezoneOverride);

  return {
    themeKey,
    tileThemeKey,
    viewMode,
    textColor,
    timeDisplayMode,
    timezoneOverride,
  } satisfies {
    themeKey: LobbyThemeKey;
    tileThemeKey: LobbyThemeKey;
    viewMode: LobbyViewMode;
    textColor: LobbyTextColor;
    timeDisplayMode: TimeDisplayMode;
    timezoneOverride: string | null;
  };
}

export async function loadAppearancePreferenceForUser(
  prisma: PrismaClient,
  userId: number
): Promise<StoredAppearancePreference> {
  const preference = await prisma.userAppearancePreference.findUnique({
    where: { userId },
    select: {
      themeKey: true,
      tileThemeKey: true,
      viewMode: true,
      textColor: true,
      timeDisplayMode: true,
      timezoneOverride: true,
      updatedAt: true,
    },
  });

  const normalized = normalizeAppearancePreference({
    themeKey: preference?.themeKey ?? null,
    tileThemeKey: preference?.tileThemeKey ?? null,
    viewMode: preference?.viewMode ?? null,
    textColor: preference?.textColor ?? null,
    timeDisplayMode: preference?.timeDisplayMode ?? null,
    timezoneOverride: preference?.timezoneOverride ?? null,
  });

  return {
    ...normalized,
    updatedAt: preference?.updatedAt?.toISOString() ?? null,
  };
}

export async function loadAppearancePreferenceMap(
  prisma: PrismaClient,
  userIds: number[]
): Promise<Map<number, StoredAppearancePreference>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter((value) => Number.isInteger(value))));
  const preferenceMap = new Map<number, StoredAppearancePreference>();

  if (uniqueUserIds.length === 0) {
    return preferenceMap;
  }

  const preferences = await prisma.userAppearancePreference.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: {
      userId: true,
      themeKey: true,
      tileThemeKey: true,
      viewMode: true,
      textColor: true,
      timeDisplayMode: true,
      timezoneOverride: true,
      updatedAt: true,
    },
  });

  for (const userId of uniqueUserIds) {
    preferenceMap.set(userId, {
      themeKey: DEFAULT_LOBBY_THEME,
      tileThemeKey: DEFAULT_LOBBY_TILE_THEME,
      viewMode: DEFAULT_LOBBY_VIEW,
      textColor: DEFAULT_LOBBY_TEXT_COLOR,
      timeDisplayMode: DEFAULT_TIME_DISPLAY_MODE,
      timezoneOverride: null,
      updatedAt: null,
    });
  }

  for (const preference of preferences) {
    const normalized = normalizeAppearancePreference(preference);
    preferenceMap.set(preference.userId, {
      ...normalized,
      updatedAt: preference.updatedAt.toISOString(),
    });
  }

  return preferenceMap;
}

export async function upsertAppearancePreference(
  prisma: PrismaClient,
  userId: number,
  input: {
    themeKey?: string | null;
    tileThemeKey?: string | null;
    viewMode?: string | null;
    textColor?: string | null;
    timeDisplayMode?: string | null;
    timezoneOverride?: string | null;
  }
) {
  const normalized = normalizeAppearancePreference(input);

  return prisma.userAppearancePreference.upsert({
    where: { userId },
    update: normalized,
    create: {
      userId,
      ...normalized,
    },
  });
}

function normalizeMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!metadata) return null;

  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

export async function recordUserActivity(
  prisma: ActivityDbClient,
  input: {
    userId: number;
    type: string;
    path?: string | null;
    label?: string | null;
    metadata?: Record<string, unknown> | null;
    dedupeWithinSeconds?: number;
  }
) {
  const type = normalizeActivityType(input.type);
  if (!type) {
    return null;
  }

  const path = normalizeActivityPath(input.path);
  const label = normalizeActivityLabel(input.label);
  const metadata = normalizeMetadata(input.metadata);
  const dedupeWithinSeconds = Math.max(0, Math.round(input.dedupeWithinSeconds ?? 0));

  if (dedupeWithinSeconds > 0) {
    const since = new Date(Date.now() - dedupeWithinSeconds * 1000);
    const existing = await prisma.userActivityEvent.findFirst({
      where: {
        userId: input.userId,
        type,
        path,
        label,
        createdAt: { gte: since },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (existing) {
      return existing;
    }
  }

  return prisma.userActivityEvent.create({
    data: {
      userId: input.userId,
      type,
      path,
      label,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function loadRecentActivityMap(
  prisma: PrismaClient,
  userIds: number[],
  limitPerUser = 8
): Promise<Map<number, UserActivityEntry[]>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter((value) => Number.isInteger(value))));
  const activityMap = new Map<number, UserActivityEntry[]>();

  for (const userId of uniqueUserIds) {
    activityMap.set(userId, []);
  }

  if (uniqueUserIds.length === 0) {
    return activityMap;
  }

  const events = await prisma.userActivityEvent.findMany({
    where: {
      userId: { in: uniqueUserIds },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: uniqueUserIds.length * limitPerUser,
  });

  for (const event of events) {
    const bucket = activityMap.get(event.userId);
    if (!bucket || bucket.length >= limitPerUser) {
      continue;
    }

    bucket.push({
      id: event.id,
      type: event.type,
      path: event.path,
      label: event.label,
      metadata:
        event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
          ? (event.metadata as Record<string, unknown>)
          : null,
      createdAt: event.createdAt.toISOString(),
    });
  }

  return activityMap;
}
