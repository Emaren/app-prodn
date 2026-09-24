import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIVITY_LIMIT = 64;
const BATCH_LOOKBACK_MS = 6 * 60 * 60 * 1000;
const ACTIVE_BATCH_FRESH_MS = 5 * 60 * 1000;

const BATCH_EVENT_TYPES = [
  "batch_upload_started",
  "batch_upload_scanned",
  "batch_upload_file_started",
  "batch_upload_file_stable",
  "batch_upload_file_skipped",
  "batch_upload_file_succeeded",
  "batch_upload_file_failed",
  "batch_upload_finished",
  "batch_upload_failed",
] as const;

const BATCH_TERMINAL_EVENTS = new Set([
  "batch_upload_finished",
  "batch_upload_failed",
]);

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function numberField(source: JsonRecord, key: string) {
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}

function booleanField(source: JsonRecord, key: string) {
  return source[key] === true;
}

function displayName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
} | null | undefined) {
  return (
    user?.inGameName?.trim() ||
    user?.steamPersonaName?.trim() ||
    user?.uid?.trim() ||
    "Unknown warrior"
  );
}

function activityKind(metadata: JsonRecord) {
  if (booleanField(metadata, "packageUpload")) return "batch" as const;
  if (booleanField(metadata, "viaWatcher")) return "watcher" as const;
  return "manual" as const;
}

function activityCount(metadata: JsonRecord, kind: "batch" | "watcher" | "manual") {
  if (kind !== "batch") return 1;

  return (
    numberField(metadata, "receivedCount") ??
    numberField(metadata, "uploadedCount") ??
    1
  );
}

export async function GET() {
  const prisma = getPrisma();
  const now = new Date();
  const batchCutoff = new Date(now.getTime() - BATCH_LOOKBACK_MS);
  const dayCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [uploadEvents, batchEvents] = await Promise.all([
    prisma.userActivityEvent.findMany({
      where: {
        type: "replay_upload",
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      take: ACTIVITY_LIMIT,
      select: {
        id: true,
        label: true,
        metadata: true,
        createdAt: true,
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
      where: {
        eventType: {
          in: [...BATCH_EVENT_TYPES],
        },
        createdAt: {
          gte: batchCutoff,
        },
      },
      orderBy: [
        { createdAt: "asc" },
        { id: "asc" },
      ],
      take: 512,
      select: {
        id: true,
        createdAt: true,
        eventType: true,
        userUid: true,
        watcherId: true,
        sessionId: true,
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

  const uploads = uploadEvents.map((event) => {
    const metadata = record(event.metadata);
    const kind = activityKind(metadata);

    return {
      id: `upload-${event.id}`,
      kind,
      state: "complete" as const,
      occurredAt: event.createdAt.toISOString(),
      warrior: displayName(event.user),
      uid: event.user.uid,
      count: activityCount(metadata, kind),
      uploadedCount: numberField(metadata, "uploadedCount"),
      parsedCount: numberField(metadata, "parsedCount"),
      resultReadyCount: numberField(metadata, "resultReadyCount"),
      duplicateCount: numberField(metadata, "duplicateCount"),
      failedCount: numberField(metadata, "failedCount"),
      label:
        kind === "batch"
          ? "REPLAY PACK"
          : kind === "watcher"
            ? "WATCHER INGEST"
            : "MANUAL UPLOAD",
    };
  });

  type BatchAccumulator = {
    key: string;
    warrior: string;
    uid: string | null;
    startedAt: Date;
    updatedAt: Date;
    latestEventType: string;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
    seenCount: number;
  };

  const batches = new Map<string, BatchAccumulator>();

  for (const event of batchEvents) {
    const identity =
      event.userUid ||
      event.user?.uid ||
      `watcher:${event.watcherId || "unknown"}`;

    const lane =
      event.sessionId ||
      event.watcherId ||
      "default";

    const key = `${identity}:${lane}`;

    if (
      event.eventType === "batch_upload_started" ||
      !batches.has(key)
    ) {
      batches.set(key, {
        key,
        warrior: displayName(event.user),
        uid: event.user?.uid ?? event.userUid ?? null,
        startedAt: event.createdAt,
        updatedAt: event.createdAt,
        latestEventType: event.eventType,
        succeededCount: 0,
        failedCount: 0,
        skippedCount: 0,
        seenCount: 0,
      });
    }

    const batch = batches.get(key);
    if (!batch) continue;

    batch.updatedAt = event.createdAt;
    batch.latestEventType = event.eventType;
    batch.seenCount += 1;

    if (event.eventType === "batch_upload_file_succeeded") {
      batch.succeededCount += 1;
    } else if (event.eventType === "batch_upload_file_failed") {
      batch.failedCount += 1;
    } else if (event.eventType === "batch_upload_file_skipped") {
      batch.skippedCount += 1;
    }
  }

  const batchStates = Array.from(batches.values())
    .map((batch) => {
      const terminal = BATCH_TERMINAL_EVENTS.has(batch.latestEventType);
      const fresh =
        now.getTime() - batch.updatedAt.getTime() <= ACTIVE_BATCH_FRESH_MS;

      const state =
        batch.latestEventType === "batch_upload_failed"
          ? "failed"
          : batch.latestEventType === "batch_upload_finished"
            ? "complete"
            : fresh
              ? "active"
              : "stale";

      return {
        id: `batch-${batch.key}-${batch.startedAt.getTime()}`,
        kind: "batch" as const,
        state,
        warrior: batch.warrior,
        uid: batch.uid,
        startedAt: batch.startedAt.toISOString(),
        occurredAt: batch.updatedAt.toISOString(),
        succeededCount: batch.succeededCount,
        failedCount: batch.failedCount,
        skippedCount: batch.skippedCount,
        seenCount: batch.seenCount,
        latestEventType: batch.latestEventType,
        terminal,
      };
    })
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime()
    );

  const activeBatches = batchStates.filter(
    (batch) => batch.state === "active"
  );

  const batchMilestones = batchStates
    .filter((batch) => batch.state !== "stale")
    .slice(0, 12)
    .map((batch) => ({
      id: batch.id,
      kind: "batch" as const,
      state: batch.state,
      occurredAt: batch.occurredAt,
      warrior: batch.warrior,
      uid: batch.uid,
      count: Math.max(
        1,
        batch.succeededCount + batch.failedCount + batch.skippedCount
      ),
      uploadedCount: batch.succeededCount,
      parsedCount: null,
      resultReadyCount: null,
      duplicateCount: null,
      failedCount: batch.failedCount,
      label:
        batch.state === "active"
          ? "BATCH INTAKE LIVE"
          : batch.state === "failed"
            ? "BATCH INTERRUPTED"
            : "BATCH COMPLETE",
    }));

  const feed = [...uploads, ...batchMilestones]
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime()
    )
    .slice(0, 48);

  const recentUploads = uploads.filter(
    (event) => new Date(event.occurredAt) >= dayCutoff
  );

  const summary = {
    activeBatches: activeBatches.length,
    manualEvents24h: recentUploads.filter(
      (event) => event.kind === "manual"
    ).length,
    packageEvents24h: recentUploads.filter(
      (event) => event.kind === "batch"
    ).length,
    watcherEvents24h: recentUploads.filter(
      (event) => event.kind === "watcher"
    ).length,
    gamesReceived24h: recentUploads.reduce(
      (sum, event) => sum + event.count,
      0
    ),
  };

  return NextResponse.json(
    {
      ok: true,
      generatedAt: now.toISOString(),
      summary,
      activeBatches: activeBatches.slice(0, 6),
      feed,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    }
  );
}
