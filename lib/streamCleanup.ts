import type { PrismaClient } from "@/lib/generated/prisma";
import { AOE2WAR_STREAM_SOURCE_TYPES } from "@/lib/streamRequestAuth";
import { removeStreamChunks } from "@/lib/streamStorage";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const STALE_STREAM_END_MS = 3 * 60 * 1000;
const STALE_EXTERNAL_PLACEHOLDER_MS = 20 * 60 * 1000;
const DEFAULT_CHUNK_RETENTION_MS = 6 * 60 * 60 * 1000;
const CHUNK_RETENTION_MS = readPositiveMs(
  process.env.AOE2_STREAM_CHUNK_RETENTION_MS,
  DEFAULT_CHUNK_RETENTION_MS
);

let lastCleanupAt = 0;

function readPositiveMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cutoffDate(ageMs: number) {
  return new Date(Date.now() - ageMs);
}

export async function cleanupBrowserStreams(prisma: PrismaClient) {
  const staleBefore = cutoffDate(STALE_STREAM_END_MS);
  const staleExternalBefore = cutoffDate(STALE_EXTERNAL_PLACEHOLDER_MS);
  const chunkRemovalBefore = cutoffDate(CHUNK_RETENTION_MS);
  const now = new Date();

  const staleStreams = await prisma.gameWatchStream.findMany({
    where: {
      sourceType: {
        in: [...AOE2WAR_STREAM_SOURCE_TYPES],
      },
      status: {
        in: ["starting", "live"],
      },
      OR: [
        { lastHeartbeatAt: { lt: staleBefore } },
        {
          lastHeartbeatAt: null,
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    select: { id: true },
  });

  if (staleStreams.length > 0) {
    await prisma.gameWatchStream.updateMany({
      where: {
        id: {
          in: staleStreams.map((stream) => stream.id),
        },
      },
      data: {
        status: "ended",
        endedAt: now,
        isPrimary: false,
      },
    });
  }

  const staleExternalPlaceholders = await prisma.gameWatchStream.findMany({
    where: {
      provider: {
        not: "aoe2war",
      },
      sourceType: {
        notIn: [...AOE2WAR_STREAM_SOURCE_TYPES],
      },
      status: {
        in: ["starting", "live"],
      },
      chunkCount: 0,
      latestChunkSeq: {
        lte: -1,
      },
      lastHeartbeatAt: null,
      updatedAt: {
        lt: staleExternalBefore,
      },
    },
    select: { id: true },
    take: 200,
  });

  if (staleExternalPlaceholders.length > 0) {
    await prisma.gameWatchStream.updateMany({
      where: {
        id: {
          in: staleExternalPlaceholders.map((stream) => stream.id),
        },
      },
      data: {
        status: "ended",
        endedAt: now,
        isPrimary: false,
      },
    });
  }

  const removableStreams = await prisma.gameWatchStream.findMany({
    where: {
      sourceType: {
        in: [...AOE2WAR_STREAM_SOURCE_TYPES],
      },
      status: {
        in: ["ended", "failed", "removed"],
      },
      OR: [
        { endedAt: { lt: chunkRemovalBefore } },
        {
          endedAt: null,
          updatedAt: { lt: chunkRemovalBefore },
        },
      ],
    },
    select: { id: true },
    take: 100,
  });

  await Promise.allSettled(removableStreams.map((stream) => removeStreamChunks(stream.id)));

  return {
    ended: staleStreams.length,
    endedExternalPlaceholders: staleExternalPlaceholders.length,
    pruned: removableStreams.length,
  };
}

export async function maybeCleanupBrowserStreams(prisma: PrismaClient) {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) {
    return { skipped: true, ended: 0, endedExternalPlaceholders: 0, pruned: 0 };
  }

  lastCleanupAt = now;
  const result = await cleanupBrowserStreams(prisma);
  return { skipped: false, ...result };
}
