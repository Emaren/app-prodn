import type { NextRequest } from "next/server";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

import {
  WATCHER_DOWNLOAD_ARTIFACTS,
  type WatcherArtifactKey,
  type WatcherArtifactPlatform,
} from "@/lib/watcherRelease";

type WatcherDownloadGroupRow = {
  platform: string;
  artifact: string;
  _count: {
    _all: number;
  };
};

type WatcherDownloadSignalFields = {
  ipAddress?: string | null;
  userAgent?: string | null;
  referer?: string | null;
};

type DownloadForClassification = {
  id: number;
  createdAt: Date;
  userId: number | null;
  platform: string;
  artifact: string;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
};

type WatcherEventForClassification = {
  createdAt: Date;
  userId: number | null;
  userUid: string | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
};

type WatcherMatchForClassification = {
  createdAt: Date;
  userUid: string | null;
};

const PREFETCH_HEADER_NAMES = [
  "next-router-prefetch",
  "x-middleware-prefetch",
  "purpose",
  "sec-purpose",
  "x-purpose",
] as const;

const BOT_OR_SCRIPT_USER_AGENT_MARKERS = [
  "ahrefs",
  "axios/",
  "bot",
  "crawler",
  "curl/",
  "facebookexternalhit",
  "go-http-client",
  "headlesschrome",
  "httpie",
  "insomnia",
  "node",
  "playwright",
  "postmanruntime",
  "puppeteer",
  "python-requests",
  "scanner",
  "spider",
  "undici",
  "wget/",
] as const;

const INTERNAL_TEST_REFERER_MARKERS = [
  "127.0.0.1",
  "0.0.0.0",
  "localhost",
] as const;

const INTERNAL_TEST_IP_PREFIXES = [
  "10.",
  "127.",
  "192.168.",
  "::1",
  "::ffff:10.",
  "::ffff:127.",
  "::ffff:192.168.",
] as const;

const INTERNAL_TEST_172_PREFIXES = Array.from(
  { length: 16 },
  (_, index) => `172.${16 + index}.`
) as readonly string[];

const INTERNAL_TEST_172_MAPPED_PREFIXES = Array.from(
  { length: 16 },
  (_, index) => `::ffff:172.${16 + index}.`
) as readonly string[];

const WATCHER_PARSE_SOURCES = ["watcher_live", "watcher_final"] as const;
const UPLOAD_EVENT_TYPES = ["upload_attempted", "upload_succeeded", "upload_failed"] as const;
const LINKED_OPEN_EVENT_TYPES = ["app_open", "auth_success"] as const;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const BURST_WINDOW_MS = 30 * 60 * 1000;

export type WatcherPackagePullClassification =
  | "converted_to_match"
  | "converted_to_app_open"
  | "signed_in_package_pull"
  | "guest_direct_pull"
  | "likely_scraper_probe"
  | "suspicious_platform_mismatch"
  | "unknown_one_off_external_pull";

export type WatcherDownloadSummaryRow = {
  key: WatcherArtifactKey;
  platform: WatcherArtifactPlatform;
  title: string;
  shortLabel: string;
  format: string;
  totalCount: number;
  signedInCount: number;
  guestCount: number;
  likelyProbeCount: number;
  last24Hours: number;
  last7Days: number;
};

export type WatcherDownloadRecentRow = {
  id: number;
  createdAt: string;
  platform: WatcherArtifactPlatform;
  artifact: WatcherArtifactKey;
  title: string;
  format: string;
  version: string;
  filename: string;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  classification: WatcherPackagePullClassification;
  classificationDetail: string;
  userUid: string | null;
  userDisplayName: string | null;
};

export type WatcherMetricWindow = {
  last24Hours: number;
  last7Days: number;
  allTime: number;
};

export type WatcherDownloadAnalytics = {
  packagePulls: WatcherMetricWindow & {
    signedIn: number;
    guest: number;
    likelyProbe: number;
  };
  confirmedWatcherUsers: {
    fromClientEvents: number;
    fromWatcherSubmittedGames: number;
    totalKnown: number;
    detail: string;
  };
  watcherAppOpens: WatcherMetricWindow;
  linkedWatcherOpens: WatcherMetricWindow;
  uploadEvents: {
    attempted: WatcherMetricWindow;
    succeeded: WatcherMetricWindow;
    failed: WatcherMetricWindow;
  };
  parsedMatches: {
    watcher: WatcherMetricWindow;
    fileUpload: WatcherMetricWindow;
    bySource: Array<{
      parseSource: string;
      count: number;
    }>;
  };
  manualUploadUsers: number;
  summary: {
    totalCount: number;
    signedInCount: number;
    guestCount: number;
    likelyProbeCount: number;
    last24Hours: number;
    last7Days: number;
    rows: WatcherDownloadSummaryRow[];
  };
  recent: WatcherDownloadRecentRow[];
};

function normalizeHeaderValue(value: string | null, maxLength: number) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function buildCountMap(rows: WatcherDownloadGroupRow[]) {
  return new Map<string, number>(
    rows.map((row) => [`${row.platform}:${row.artifact}`, row._count._all] as const)
  );
}

function headerValueIncludes(request: NextRequest, headerName: string, needle: string) {
  const value = request.headers.get(headerName);
  if (!value) {
    return false;
  }

  return value.toLowerCase().includes(needle.toLowerCase());
}

function buildBotOrScriptWhere(
  extraWhere: Prisma.WatcherDownloadEventWhereInput = {}
): Prisma.WatcherDownloadEventWhereInput {
  return {
    ...extraWhere,
    OR: BOT_OR_SCRIPT_USER_AGENT_MARKERS.map((marker) => ({
      userAgent: {
        contains: marker,
        mode: "insensitive" as const,
      },
    })),
  };
}

export function shouldSkipWatcherDownloadLogging(request: NextRequest) {
  if (
    PREFETCH_HEADER_NAMES.some((headerName) => headerValueIncludes(request, headerName, "prefetch"))
  ) {
    return true;
  }

  if (request.headers.has("next-router-prefetch") || request.headers.has("x-middleware-prefetch")) {
    return true;
  }

  if (headerValueIncludes(request, "accept", "text/x-component") || request.headers.has("rsc")) {
    return true;
  }

  const secFetchDest = request.headers.get("sec-fetch-dest")?.toLowerCase() ?? "";
  const secFetchMode = request.headers.get("sec-fetch-mode")?.toLowerCase() ?? "";

  if (secFetchDest === "empty") {
    return true;
  }

  if (secFetchMode === "cors" || secFetchMode === "same-origin") {
    return true;
  }

  return false;
}

export function readWatcherDownloadIpAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return normalizeHeaderValue(forwarded.split(",")[0] ?? null, 80);
  }

  return (
    normalizeHeaderValue(request.headers.get("x-real-ip"), 80) ||
    normalizeHeaderValue(request.headers.get("cf-connecting-ip"), 80)
  );
}

export function readWatcherDownloadReferer(request: NextRequest) {
  return normalizeHeaderValue(request.headers.get("referer"), 255);
}

export function readWatcherDownloadUserAgent(request: NextRequest) {
  return normalizeHeaderValue(request.headers.get("user-agent"), 512);
}

function isInternalAddressOrReferer(fields: WatcherDownloadSignalFields) {
  const referer = fields.referer?.toLowerCase() ?? "";
  const ipAddress = fields.ipAddress?.toLowerCase() ?? "";

  return (
    INTERNAL_TEST_REFERER_MARKERS.some((marker) => referer.includes(marker)) ||
    INTERNAL_TEST_IP_PREFIXES.some((prefix) => ipAddress.startsWith(prefix)) ||
    INTERNAL_TEST_172_PREFIXES.some((prefix) => ipAddress.startsWith(prefix)) ||
    INTERNAL_TEST_172_MAPPED_PREFIXES.some((prefix) => ipAddress.startsWith(prefix))
  );
}

function isBotOrScriptUserAgent(userAgent: string | null | undefined) {
  const normalized = userAgent?.toLowerCase() ?? "";
  return BOT_OR_SCRIPT_USER_AGENT_MARKERS.some((marker) => normalized.includes(marker));
}

function artifactPlatformMatchesUserAgent(platform: string, userAgent: string | null | undefined) {
  const normalized = userAgent?.toLowerCase() ?? "";
  if (!normalized) return true;

  const uaLooksWindows = normalized.includes("windows");
  const uaLooksMac = normalized.includes("macintosh") || normalized.includes("mac os x");
  const uaLooksLinux =
    normalized.includes("linux") && !normalized.includes("android") && !normalized.includes("windows");

  if (!uaLooksWindows && !uaLooksMac && !uaLooksLinux) return true;
  if (platform === "windows") return uaLooksWindows;
  if (platform === "macos") return uaLooksMac;
  if (platform === "linux") return uaLooksLinux;
  return true;
}

function displayUserName(entry: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return entry.inGameName || entry.steamPersonaName || entry.uid || null;
}

function countDistinctUsers(rows: Array<{ userId?: number | null; userUid?: string | null }>) {
  return new Set(
    rows
      .map((row) => row.userId?.toString() || row.userUid?.trim() || "")
      .filter(Boolean)
  ).size;
}

function classifyPackagePull(
  row: DownloadForClassification,
  context: {
    allDownloads: DownloadForClassification[];
    watcherEvents: WatcherEventForClassification[];
    watcherMatches: WatcherMatchForClassification[];
  }
): {
  classification: WatcherPackagePullClassification;
  detail: string;
} {
  const rowTime = row.createdAt.getTime();
  const sameFingerprint = (other: DownloadForClassification | WatcherEventForClassification) =>
    Boolean(
      row.ipAddress &&
        row.userAgent &&
        other.ipAddress === row.ipAddress &&
        other.userAgent === row.userAgent
    );

  const convertedToMatch = context.watcherMatches.some((match) => {
    if (!row.user?.uid || match.userUid !== row.user.uid) return false;
    const delta = match.createdAt.getTime() - rowTime;
    return delta >= 0 && delta <= SEVEN_DAYS_MS;
  });
  if (convertedToMatch) {
    return {
      classification: "converted_to_match",
      detail: "Package pull later matched watcher-submitted game_stats.",
    };
  }

  const convertedToAppOpen = context.watcherEvents.some((event) => {
    if (event.eventType !== "app_open") return false;
    const delta = event.createdAt.getTime() - rowTime;
    if (delta < 0 || delta > ONE_DAY_MS) return false;
    return Boolean((row.userId && event.userId === row.userId) || sameFingerprint(event));
  });
  if (convertedToAppOpen) {
    return {
      classification: "converted_to_app_open",
      detail: "Package pull was followed by a watcher app_open signal.",
    };
  }

  if (row.userId) {
    return {
      classification: "signed_in_package_pull",
      detail: "Signed-in package pull. Stronger than guest traffic, still not an install by itself.",
    };
  }

  if (isBotOrScriptUserAgent(row.userAgent)) {
    return {
      classification: "likely_scraper_probe",
      detail: "Bot/script-style user agent.",
    };
  }

  if (!artifactPlatformMatchesUserAgent(row.platform, row.userAgent)) {
    return {
      classification: "suspicious_platform_mismatch",
      detail: "Requested package platform does not match the user-agent OS.",
    };
  }

  const burstArtifacts = new Set(
    context.allDownloads
      .filter((other) => {
        const delta = Math.abs(other.createdAt.getTime() - rowTime);
        return delta <= BURST_WINDOW_MS && sameFingerprint(other);
      })
      .map((other) => `${other.platform}:${other.artifact}`)
  );
  if (burstArtifacts.size >= 3) {
    return {
      classification: "likely_scraper_probe",
      detail: "Same request fingerprint pulled several watcher artifacts in a tight window.",
    };
  }

  if (isInternalAddressOrReferer(row)) {
    return {
      classification: "likely_scraper_probe",
      detail: "Local/internal request fingerprint.",
    };
  }

  if (!row.referer && !row.userId) {
    return {
      classification: "guest_direct_pull",
      detail: "Guest request with empty referer and no confirmed watcher run.",
    };
  }

  return {
    classification: "unknown_one_off_external_pull",
    detail: "Unknown external package pull. Do not count as a user without telemetry or matches.",
  };
}

function isLikelyProbeClassification(classification: WatcherPackagePullClassification) {
  return (
    classification === "likely_scraper_probe" ||
    classification === "suspicious_platform_mismatch"
  );
}

async function loadWatcherClientEventWindowMetric(
  prisma: PrismaClient,
  where: Prisma.WatcherClientEventWhereInput,
  last24HoursCutoff: Date,
  last7DaysCutoff: Date
): Promise<WatcherMetricWindow> {
  const [allTime, last24Hours, last7Days] = await Promise.all([
    prisma.watcherClientEvent.count({ where }),
    prisma.watcherClientEvent.count({
      where: {
        ...where,
        createdAt: { gte: last24HoursCutoff },
      },
    }),
    prisma.watcherClientEvent.count({
      where: {
        ...where,
        createdAt: { gte: last7DaysCutoff },
      },
    }),
  ]);

  return { allTime, last24Hours, last7Days };
}

async function loadGameStatsWindowMetric(
  prisma: PrismaClient,
  where: Prisma.GameStatsWhereInput,
  last24HoursCutoff: Date,
  last7DaysCutoff: Date
): Promise<WatcherMetricWindow> {
  const [allTime, last24Hours, last7Days] = await Promise.all([
    prisma.gameStats.count({ where }),
    prisma.gameStats.count({
      where: {
        ...where,
        createdAt: { gte: last24HoursCutoff },
      },
    }),
    prisma.gameStats.count({
      where: {
        ...where,
        createdAt: { gte: last7DaysCutoff },
      },
    }),
  ]);

  return { allTime, last24Hours, last7Days };
}

export async function loadWatcherDownloadAnalytics(
  prisma: PrismaClient
): Promise<WatcherDownloadAnalytics> {
  const now = Date.now();
  const last24HoursCutoff = new Date(now - ONE_DAY_MS);
  const last7DaysCutoff = new Date(now - SEVEN_DAYS_MS);
  const classificationCutoff = new Date(now - 8 * ONE_DAY_MS);

  const watcherSourceWhere: Prisma.GameStatsWhereInput = {
    parse_source: {
      in: [...WATCHER_PARSE_SOURCES],
    },
  };
  const fileUploadWhere: Prisma.GameStatsWhereInput = { parse_source: "file_upload" };

  const [
    totalCount,
    signedInCount,
    last24Hours,
    last7Days,
    groupedAll,
    grouped24Hours,
    grouped7Days,
    groupedSignedInAll,
    botOrScriptCount,
    recentRows,
    classificationRows,
    watcherEventsForClassification,
    watcherMatchesForClassification,
    watcherUserEventRows,
    watcherUserGameRows,
    watcherAppOpens,
    linkedWatcherOpens,
    uploadAttempted,
    uploadSucceeded,
    uploadFailed,
    watcherParsedMatches,
    fileUploadParsedMatches,
    manualUploadUserRows,
    parseSourceRows,
  ] = await Promise.all([
    prisma.watcherDownloadEvent.count(),
    prisma.watcherDownloadEvent.count({ where: { userId: { not: null } } }),
    prisma.watcherDownloadEvent.count({ where: { createdAt: { gte: last24HoursCutoff } } }),
    prisma.watcherDownloadEvent.count({ where: { createdAt: { gte: last7DaysCutoff } } }),
    prisma.watcherDownloadEvent.groupBy({
      by: ["platform", "artifact"],
      _count: { _all: true },
    }),
    prisma.watcherDownloadEvent.groupBy({
      by: ["platform", "artifact"],
      where: { createdAt: { gte: last24HoursCutoff } },
      _count: { _all: true },
    }),
    prisma.watcherDownloadEvent.groupBy({
      by: ["platform", "artifact"],
      where: { createdAt: { gte: last7DaysCutoff } },
      _count: { _all: true },
    }),
    prisma.watcherDownloadEvent.groupBy({
      by: ["platform", "artifact"],
      where: { userId: { not: null } },
      _count: { _all: true },
    }),
    prisma.watcherDownloadEvent.count({ where: buildBotOrScriptWhere() }),
    prisma.watcherDownloadEvent.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        createdAt: true,
        userId: true,
        platform: true,
        artifact: true,
        version: true,
        filename: true,
        ipAddress: true,
        userAgent: true,
        referer: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.watcherDownloadEvent.findMany({
      where: { createdAt: { gte: classificationCutoff } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        userId: true,
        platform: true,
        artifact: true,
        ipAddress: true,
        userAgent: true,
        referer: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.watcherClientEvent.findMany({
      where: { createdAt: { gte: classificationCutoff } },
      select: {
        createdAt: true,
        userId: true,
        userUid: true,
        eventType: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    prisma.gameStats.findMany({
      where: {
        ...watcherSourceWhere,
        createdAt: { gte: classificationCutoff },
      },
      select: {
        createdAt: true,
        userUid: true,
      },
    }),
    prisma.watcherClientEvent.findMany({
      where: {
        userId: { not: null },
        eventType: { in: ["app_open", "auth_success", "heartbeat", ...UPLOAD_EVENT_TYPES] },
      },
      distinct: ["userId"],
      select: { userId: true, userUid: true },
    }),
    prisma.gameStats.findMany({
      where: watcherSourceWhere,
      distinct: ["userUid"],
      select: { userUid: true },
    }),
    loadWatcherClientEventWindowMetric(prisma, { eventType: "app_open" }, last24HoursCutoff, last7DaysCutoff),
    loadWatcherClientEventWindowMetric(
      prisma,
      { eventType: { in: [...LINKED_OPEN_EVENT_TYPES] }, userId: { not: null } },
      last24HoursCutoff,
      last7DaysCutoff
    ),
    loadWatcherClientEventWindowMetric(prisma, { eventType: "upload_attempted" }, last24HoursCutoff, last7DaysCutoff),
    loadWatcherClientEventWindowMetric(prisma, { eventType: "upload_succeeded" }, last24HoursCutoff, last7DaysCutoff),
    loadWatcherClientEventWindowMetric(prisma, { eventType: "upload_failed" }, last24HoursCutoff, last7DaysCutoff),
    loadGameStatsWindowMetric(prisma, watcherSourceWhere, last24HoursCutoff, last7DaysCutoff),
    loadGameStatsWindowMetric(prisma, fileUploadWhere, last24HoursCutoff, last7DaysCutoff),
    prisma.gameStats.findMany({
      where: fileUploadWhere,
      distinct: ["userUid"],
      select: { userUid: true },
    }),
    prisma.gameStats.groupBy({
      by: ["parse_source"],
      _count: { _all: true },
    }),
  ]);

  const totalMap = buildCountMap(groupedAll);
  const last24Map = buildCountMap(grouped24Hours);
  const last7Map = buildCountMap(grouped7Days);
  const signedInMap = buildCountMap(groupedSignedInAll);
  const guestCount = Math.max(0, totalCount - signedInCount);

  const classificationContext = {
    allDownloads: classificationRows,
    watcherEvents: watcherEventsForClassification,
    watcherMatches: watcherMatchesForClassification,
  };
  const classifiedRows = classificationRows.map((row) => ({
    row,
    ...classifyPackagePull(row, classificationContext),
  }));
  const likelyProbeCount = Math.max(
    botOrScriptCount,
    classifiedRows.filter((entry) => isLikelyProbeClassification(entry.classification)).length
  );
  const likelyProbeMap = new Map<string, number>();
  for (const entry of classifiedRows) {
    if (!isLikelyProbeClassification(entry.classification)) continue;
    const key = `${entry.row.platform}:${entry.row.artifact}`;
    likelyProbeMap.set(key, (likelyProbeMap.get(key) ?? 0) + 1);
  }

  const rows = WATCHER_DOWNLOAD_ARTIFACTS.map((artifact) => {
    const countKey = `${artifact.platform}:${artifact.key}`;
    const totalForArtifact = totalMap.get(countKey) ?? 0;
    const signedInForArtifact = signedInMap.get(countKey) ?? 0;

    return {
      key: artifact.key,
      platform: artifact.platform,
      title: artifact.title,
      shortLabel: artifact.shortLabel,
      format: artifact.format,
      totalCount: totalForArtifact,
      signedInCount: signedInForArtifact,
      guestCount: Math.max(0, totalForArtifact - signedInForArtifact),
      likelyProbeCount: likelyProbeMap.get(countKey) ?? 0,
      last24Hours: last24Map.get(countKey) ?? 0,
      last7Days: last7Map.get(countKey) ?? 0,
    };
  });

  const classifiedRecentById = new Map(
    recentRows.map((row) => {
      const classified = classifyPackagePull(row, classificationContext);
      return [row.id, classified] as const;
    })
  );
  const eventUsers = countDistinctUsers(watcherUserEventRows);
  const fallbackUsers = countDistinctUsers(watcherUserGameRows);

  return {
    packagePulls: {
      allTime: totalCount,
      signedIn: signedInCount,
      guest: guestCount,
      likelyProbe: likelyProbeCount,
      last24Hours,
      last7Days,
    },
    confirmedWatcherUsers: {
      fromClientEvents: eventUsers,
      fromWatcherSubmittedGames: fallbackUsers,
      totalKnown: countDistinctUsers([...watcherUserEventRows, ...watcherUserGameRows]),
      detail: "Client telemetry plus historical fallback from watcher-submitted game_stats.",
    },
    watcherAppOpens,
    linkedWatcherOpens,
    uploadEvents: {
      attempted: uploadAttempted,
      succeeded: uploadSucceeded,
      failed: uploadFailed,
    },
    parsedMatches: {
      watcher: watcherParsedMatches,
      fileUpload: fileUploadParsedMatches,
      bySource: parseSourceRows.map((row) => ({
        parseSource: row.parse_source || "unknown",
        count: row._count._all,
      })),
    },
    manualUploadUsers: countDistinctUsers(manualUploadUserRows),
    summary: {
      totalCount,
      signedInCount,
      guestCount,
      likelyProbeCount,
      last24Hours,
      last7Days,
      rows,
    },
    recent: recentRows.map((row) => {
      const artifact =
        WATCHER_DOWNLOAD_ARTIFACTS.find(
          (entry) => entry.platform === row.platform && entry.key === row.artifact
        ) ?? null;
      const classification = classifiedRecentById.get(row.id) ?? {
        classification: "unknown_one_off_external_pull" as const,
        detail: "Unknown external package pull.",
      };

      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        platform: row.platform as WatcherArtifactPlatform,
        artifact: row.artifact as WatcherArtifactKey,
        title: artifact?.title ?? row.artifact,
        format: artifact?.format ?? "package",
        version: row.version,
        filename: row.filename,
        ipAddress: row.ipAddress ?? null,
        userAgent: row.userAgent ?? null,
        referer: row.referer ?? null,
        classification: classification.classification,
        classificationDetail: classification.detail,
        userUid: row.user?.uid ?? null,
        userDisplayName: row.user ? displayUserName(row.user) : null,
      };
    }),
  };
}
