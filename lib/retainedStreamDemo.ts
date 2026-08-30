import type { PrismaClient } from "@/lib/generated/prisma";
import { removeStreamChunks, type StreamStorageUsage } from "@/lib/streamStorage";

export const RETAINED_STREAM_DEMO_SLOT = 1;

const DEFAULT_MAX_RETAINED_DEMO_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_RETAINED_DEMO_DURATION_SECONDS = 45 * 60;
const DEFAULT_RETAINED_DEMO_TTL_SECONDS = 90 * 24 * 60 * 60;

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export const MAX_RETAINED_DEMO_BYTES = boundedInteger(
  process.env.AOE2_RETAINED_DEMO_MAX_BYTES,
  DEFAULT_MAX_RETAINED_DEMO_BYTES,
  8 * 1024 * 1024,
  2 * 1024 * 1024 * 1024,
);

export const MAX_RETAINED_DEMO_DURATION_SECONDS = boundedInteger(
  process.env.AOE2_RETAINED_DEMO_MAX_DURATION_SECONDS,
  DEFAULT_MAX_RETAINED_DEMO_DURATION_SECONDS,
  60,
  3 * 60 * 60,
);

export const RETAINED_DEMO_TTL_SECONDS = boundedInteger(
  process.env.AOE2_RETAINED_DEMO_TTL_SECONDS,
  DEFAULT_RETAINED_DEMO_TTL_SECONDS,
  24 * 60 * 60,
  365 * 24 * 60 * 60,
);

export type RetainedDemoCandidate = {
  provider: string;
  sourceType: string;
  status: string;
  startedAt: Date | null;
  endedAt: Date | null;
  usage: StreamStorageUsage;
};

export type RetainedDemoEligibility =
  | { ok: true; durationSeconds: number }
  | { ok: false; reason: string };

export class RetainedDemoConflictError extends Error {
  constructor() {
    super("A retained demonstration already exists. Delete it before retaining another.");
    this.name = "RetainedDemoConflictError";
  }
}

export class RetainedDemoStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RetainedDemoStorageError";
  }
}

export function evaluateRetainedDemoEligibility(
  candidate: RetainedDemoCandidate,
): RetainedDemoEligibility {
  if (candidate.provider !== "aoe2war" || candidate.sourceType !== "watcher_native") {
    return { ok: false, reason: "Only authenticated native Watcher streams may be retained." };
  }
  if (candidate.status !== "ended" || !candidate.startedAt || !candidate.endedAt) {
    return { ok: false, reason: "The native stream must be ended before it can be retained." };
  }

  const durationSeconds = Math.max(
    0,
    Math.ceil((candidate.endedAt.getTime() - candidate.startedAt.getTime()) / 1_000),
  );
  if (durationSeconds <= 0 || durationSeconds > MAX_RETAINED_DEMO_DURATION_SECONDS) {
    return {
      ok: false,
      reason: `The stream duration must be between 1 and ${MAX_RETAINED_DEMO_DURATION_SECONDS} seconds.`,
    };
  }
  if (candidate.usage.chunkCount <= 0 || candidate.usage.totalBytes <= 0) {
    return { ok: false, reason: "The stream has no retained media chunks." };
  }
  if (candidate.usage.totalBytes > MAX_RETAINED_DEMO_BYTES) {
    return {
      ok: false,
      reason: `The recording exceeds the ${MAX_RETAINED_DEMO_BYTES}-byte retained-demo limit.`,
    };
  }

  return { ok: true, durationSeconds };
}

async function lockRetainedDemoSlot(
  prisma: Pick<PrismaClient, "$executeRaw">,
) {
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(628221991::bigint)`;
}

export async function retainSingleStreamDemo(
  prisma: PrismaClient,
  input: {
    streamId: number;
    retainedByUserId: number;
    byteCount: number;
    durationSeconds: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + RETAINED_DEMO_TTL_SECONDS * 1_000);

  return prisma.$transaction(async (tx) => {
    await lockRetainedDemoSlot(tx);
    const current = await tx.gameWatchRetainedDemo.findUnique({
      where: { slot: RETAINED_STREAM_DEMO_SLOT },
    });
    if (current && current.streamId !== input.streamId) {
      throw new RetainedDemoConflictError();
    }

    return tx.gameWatchRetainedDemo.upsert({
      where: { slot: RETAINED_STREAM_DEMO_SLOT },
      create: {
        slot: RETAINED_STREAM_DEMO_SLOT,
        streamId: input.streamId,
        retainedByUserId: input.retainedByUserId,
        byteCount: BigInt(input.byteCount),
        durationSeconds: input.durationSeconds,
        retainedAt: now,
        expiresAt,
      },
      update: {
        byteCount: BigInt(input.byteCount),
        durationSeconds: input.durationSeconds,
        expiresAt,
      },
      include: { stream: true },
    });
  });
}

export async function deleteSingleRetainedDemo(
  prisma: PrismaClient,
  expectedStreamId?: number,
) {
  return prisma.$transaction(
    async (tx) => {
      await lockRetainedDemoSlot(tx);
      const current = await tx.gameWatchRetainedDemo.findUnique({
        where: { slot: RETAINED_STREAM_DEMO_SLOT },
      });
      if (!current) return null;
      if (expectedStreamId && current.streamId !== expectedStreamId) {
        throw new RetainedDemoConflictError();
      }

      try {
        await removeStreamChunks(current.streamId);
      } catch (error) {
        throw new RetainedDemoStorageError(
          "The retained recording could not be removed from disk; its registry entry was preserved.",
          { cause: error },
        );
      }

      await tx.gameWatchRetainedDemo.delete({
        where: { slot: RETAINED_STREAM_DEMO_SLOT },
      });
      await tx.gameWatchStream.updateMany({
        where: { id: current.streamId },
        data: { status: "removed", isPrimary: false },
      });
      return current;
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
}

export async function expireRetainedDemoIfNeeded(
  prisma: PrismaClient,
  now = new Date(),
) {
  const current = await prisma.gameWatchRetainedDemo.findUnique({
    where: { slot: RETAINED_STREAM_DEMO_SLOT },
    select: { streamId: true, expiresAt: true },
  });
  if (!current || current.expiresAt.getTime() > now.getTime()) return false;
  await deleteSingleRetainedDemo(prisma, current.streamId);
  return true;
}

export function retainedDemoPublicPayload(record: {
  byteCount: bigint;
  durationSeconds: number;
  retainedAt: Date;
  expiresAt: Date;
  stream: { id: number; sessionKey: string };
}) {
  return {
    streamId: record.stream.id,
    sessionKey: record.stream.sessionKey,
    watchUrl: `/watch/${encodeURIComponent(record.stream.sessionKey)}`,
    byteCount: record.byteCount.toString(),
    durationSeconds: record.durationSeconds,
    retainedAt: record.retainedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}
