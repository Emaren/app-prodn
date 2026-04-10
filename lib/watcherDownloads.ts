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

const PREFETCH_HEADER_NAMES = [
  "next-router-prefetch",
  "x-middleware-prefetch",
  "purpose",
  "sec-purpose",
  "x-purpose",
] as const;

const INTERNAL_TEST_USER_AGENT_MARKERS = [
  "axios/",
  "curl/",
  "go-http-client",
  "headlesschrome",
  "httpie",
  "insomnia",
  "node",
  "playwright",
  "postmanruntime",
  "puppeteer",
  "python-requests",
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

export type WatcherDownloadTrafficClass = "external" | "internal_test";

export type WatcherDownloadSummaryRow = {
  key: WatcherArtifactKey;
  platform: WatcherArtifactPlatform;
  title: string;
  shortLabel: string;
  format: string;
  totalCount: number;
  likelyExternalCount: number;
  likelyInternalTestCount: number;
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
  trafficClass: WatcherDownloadTrafficClass;
  userUid: string | null;
  userDisplayName: string | null;
};

export type WatcherDownloadAnalytics = {
  summary: {
    totalCount: number;
    likelyExternalCount: number;
    likelyInternalTestCount: number;
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

function buildInternalTestWhere(
  extraWhere: Prisma.WatcherDownloadEventWhereInput = {}
): Prisma.WatcherDownloadEventWhereInput {
  return {
    ...extraWhere,
    OR: [
      ...INTERNAL_TEST_USER_AGENT_MARKERS.map((marker) => ({
        userAgent: {
          contains: marker,
          mode: "insensitive" as const,
        },
      })),
      ...INTERNAL_TEST_REFERER_MARKERS.map((marker) => ({
        referer: {
          contains: marker,
          mode: "insensitive" as const,
        },
      })),
      ...INTERNAL_TEST_IP_PREFIXES.map((prefix) => ({
        ipAddress: {
          startsWith: prefix,
        },
      })),
      ...INTERNAL_TEST_172_PREFIXES.map((prefix) => ({
        ipAddress: {
          startsWith: prefix,
        },
      })),
      ...INTERNAL_TEST_172_MAPPED_PREFIXES.map((prefix) => ({
        ipAddress: {
          startsWith: prefix,
        },
      })),
    ],
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

export function classifyWatcherDownloadTraffic(
  fields: WatcherDownloadSignalFields
): WatcherDownloadTrafficClass {
  const userAgent = fields.userAgent?.toLowerCase() ?? "";
  const referer = fields.referer?.toLowerCase() ?? "";
  const ipAddress = fields.ipAddress?.toLowerCase() ?? "";

  if (
    INTERNAL_TEST_USER_AGENT_MARKERS.some((marker) => userAgent.includes(marker)) ||
    INTERNAL_TEST_REFERER_MARKERS.some((marker) => referer.includes(marker)) ||
    INTERNAL_TEST_IP_PREFIXES.some((prefix) => ipAddress.startsWith(prefix)) ||
    INTERNAL_TEST_172_PREFIXES.some((prefix) => ipAddress.startsWith(prefix)) ||
    INTERNAL_TEST_172_MAPPED_PREFIXES.some((prefix) => ipAddress.startsWith(prefix))
  ) {
    return "internal_test";
  }

  return "external";
}

export async function loadWatcherDownloadAnalytics(
  prisma: PrismaClient
): Promise<WatcherDownloadAnalytics> {
  const now = Date.now();
  const last24HoursCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const last7DaysCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    totalCount,
    likelyInternalTestCount,
    last24Hours,
    last7Days,
    groupedAll,
    grouped24Hours,
    grouped7Days,
    groupedInternalAll,
    recentRows,
  ] = await Promise.all([
      prisma.watcherDownloadEvent.count(),
      prisma.watcherDownloadEvent.count({
        where: buildInternalTestWhere(),
      }),
      prisma.watcherDownloadEvent.count({
        where: {
          createdAt: {
            gte: last24HoursCutoff,
          },
        },
      }),
      prisma.watcherDownloadEvent.count({
        where: {
          createdAt: {
            gte: last7DaysCutoff,
          },
        },
      }),
      prisma.watcherDownloadEvent.groupBy({
        by: ["platform", "artifact"],
        _count: {
          _all: true,
        },
      }),
      prisma.watcherDownloadEvent.groupBy({
        by: ["platform", "artifact"],
        where: {
          createdAt: {
            gte: last24HoursCutoff,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.watcherDownloadEvent.groupBy({
        by: ["platform", "artifact"],
        where: {
          createdAt: {
            gte: last7DaysCutoff,
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.watcherDownloadEvent.groupBy({
        by: ["platform", "artifact"],
        where: buildInternalTestWhere(),
        _count: {
          _all: true,
        },
      }),
      prisma.watcherDownloadEvent.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 16,
        select: {
          id: true,
          createdAt: true,
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
    ]);

  const totalMap = buildCountMap(groupedAll);
  const last24Map = buildCountMap(grouped24Hours);
  const last7Map = buildCountMap(grouped7Days);
  const internalMap = buildCountMap(groupedInternalAll);

  const rows = WATCHER_DOWNLOAD_ARTIFACTS.map((artifact) => {
    const countKey = `${artifact.platform}:${artifact.key}`;
    const totalForArtifact = totalMap.get(countKey) ?? 0;
    const internalForArtifact = internalMap.get(countKey) ?? 0;

    return {
      key: artifact.key,
      platform: artifact.platform,
      title: artifact.title,
      shortLabel: artifact.shortLabel,
      format: artifact.format,
      totalCount: totalForArtifact,
      likelyExternalCount: Math.max(0, totalForArtifact - internalForArtifact),
      likelyInternalTestCount: internalForArtifact,
      last24Hours: last24Map.get(countKey) ?? 0,
      last7Days: last7Map.get(countKey) ?? 0,
    };
  });

  return {
    summary: {
      totalCount,
      likelyExternalCount: Math.max(0, totalCount - likelyInternalTestCount),
      likelyInternalTestCount,
      last24Hours,
      last7Days,
      rows,
    },
    recent: recentRows.map((row) => {
      const artifact =
        WATCHER_DOWNLOAD_ARTIFACTS.find(
          (entry) => entry.platform === row.platform && entry.key === row.artifact
        ) ?? null;

      return {
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        platform: row.platform as WatcherArtifactPlatform,
        artifact: row.artifact as WatcherArtifactKey,
        title: artifact?.title ?? row.artifact,
        format: artifact?.format ?? "download",
        version: row.version,
        filename: row.filename,
        ipAddress: row.ipAddress ?? null,
        userAgent: row.userAgent ?? null,
        referer: row.referer ?? null,
        trafficClass: classifyWatcherDownloadTraffic({
          ipAddress: row.ipAddress ?? null,
          userAgent: row.userAgent ?? null,
          referer: row.referer ?? null,
        }),
        userUid: row.user?.uid ?? null,
        userDisplayName:
          row.user?.inGameName || row.user?.steamPersonaName || row.user?.uid || null,
      };
    }),
  };
}
