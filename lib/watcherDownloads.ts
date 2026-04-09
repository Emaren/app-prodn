import type { NextRequest } from "next/server";
import type { PrismaClient } from "@/lib/generated/prisma";

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

export type WatcherDownloadSummaryRow = {
  key: WatcherArtifactKey;
  platform: WatcherArtifactPlatform;
  title: string;
  shortLabel: string;
  format: string;
  totalCount: number;
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
  userUid: string | null;
  userDisplayName: string | null;
};

export type WatcherDownloadAnalytics = {
  summary: {
    totalCount: number;
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

export async function loadWatcherDownloadAnalytics(
  prisma: PrismaClient
): Promise<WatcherDownloadAnalytics> {
  const now = Date.now();
  const last24HoursCutoff = new Date(now - 24 * 60 * 60 * 1000);
  const last7DaysCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [totalCount, last24Hours, last7Days, groupedAll, grouped24Hours, grouped7Days, recentRows] =
    await Promise.all([
      prisma.watcherDownloadEvent.count(),
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

  const rows = WATCHER_DOWNLOAD_ARTIFACTS.map((artifact) => {
    const countKey = `${artifact.platform}:${artifact.key}`;

    return {
      key: artifact.key,
      platform: artifact.platform,
      title: artifact.title,
      shortLabel: artifact.shortLabel,
      format: artifact.format,
      totalCount: totalMap.get(countKey) ?? 0,
      last24Hours: last24Map.get(countKey) ?? 0,
      last7Days: last7Map.get(countKey) ?? 0,
    };
  });

  return {
    summary: {
      totalCount,
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
        userUid: row.user?.uid ?? null,
        userDisplayName:
          row.user?.inGameName || row.user?.steamPersonaName || row.user?.uid || null,
      };
    }),
  };
}
