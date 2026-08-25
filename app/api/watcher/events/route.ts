import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  reconcileAutomaticWatcherTerminalResults,
} from "@/lib/replayResultAdjudications";
import {
  isWatcherClientEventType,
  normalizeReplayFileName,
  normalizeWatcherString,
  readWatcherTelemetryApiKey,
  recordWatcherClientEvent,
  resolveWatcherTelemetryIdentity,
  sanitizeWatcherMetadata,
  touchWatcherTelemetryIdentity,
  type WatcherClientEventInput,
} from "@/lib/watcherTelemetry";
import {
  watcherTelemetryCoalescer,
} from "@/lib/watcherTelemetryCoalescer";
import { recordWarGraphWatcherHealth } from "@/lib/wargraph/watcherHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH_EVENTS = 25;

const TERMINAL_RECONCILE_EVENT_TYPES =
  new Set<WatcherClientEventInput["eventType"]>([
    "result_review_routed",
    "final_candidate_accepted",
    "final_settle_observation_complete",
    "monitor_stop",
  ]);

type RawWatcherEvent = Record<string, unknown>;

function toEventArray(payload: unknown): RawWatcherEvent[] {
  if (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown }).events)) {
    return (payload as { events: unknown[] }).events.filter(
      (entry): entry is RawWatcherEvent => Boolean(entry && typeof entry === "object")
    );
  }
  return payload && typeof payload === "object" ? [payload as RawWatcherEvent] : [];
}

function normalizeEvent(raw: RawWatcherEvent): WatcherClientEventInput {
  const eventType = raw.eventType || raw.event_type;
  if (!isWatcherClientEventType(eventType)) {
    throw new Error("Unsupported watcher event_type.");
  }

  return {
    eventType,
    appVersion: normalizeWatcherString(raw.appVersion || raw.app_version, 32),
    platform: normalizeWatcherString(raw.platform, 24),
    artifact: normalizeWatcherString(raw.artifact, 40),
    watcherId: normalizeWatcherString(raw.watcherId || raw.watcher_id, 80),
    sessionId: normalizeWatcherString(raw.sessionId || raw.session_id, 80),
    replayHash: normalizeWatcherString(raw.replayHash || raw.replay_hash, 64),
    replayFile: normalizeReplayFileName(raw.replayFile || raw.replay_file || raw.fileName),
    parseSource: normalizeWatcherString(raw.parseSource || raw.parse_source, 40),
    parseReason: normalizeWatcherString(raw.parseReason || raw.parse_reason, 80),
    metadata: sanitizeWatcherMetadata(raw.metadata),
  };
}

export async function POST(request: NextRequest) {
  const contentLength = Number.parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, detail: "Watcher telemetry payload too large." }, { status: 413 });
  }

  const payload = await request.json().catch(() => null);
  const rawEvents = toEventArray(payload);
  if (rawEvents.length === 0) {
    return NextResponse.json({ ok: false, detail: "No watcher events supplied." }, { status: 400 });
  }
  if (rawEvents.length > MAX_BATCH_EVENTS) {
    return NextResponse.json({ ok: false, detail: "Too many watcher events supplied." }, { status: 413 });
  }

  let events: WatcherClientEventInput[];
  try {
    events = rawEvents.map(normalizeEvent);
  } catch (error) {
    return NextResponse.json(
      { ok: false, detail: error instanceof Error ? error.message : "Invalid watcher event." },
      { status: 400 }
    );
  }

  const prisma = getPrisma();
  const identity = await resolveWatcherTelemetryIdentity(
    prisma,
    readWatcherTelemetryApiKey(request),
    { touchLastUsedAt: false },
  );

  const admissions = events.map((event) =>
    watcherTelemetryCoalescer.admit(event, identity)
  );
  const acceptedAdmissions = admissions.filter(
    (admission) => admission.accepted
  );
  const suppressed = admissions.length - acceptedAdmissions.length;

  if (acceptedAdmissions.length > 0) {
    try {
      await touchWatcherTelemetryIdentity(prisma, identity);
    } catch (error) {
      console.warn("Failed to touch watcher telemetry identity:", error);
    }
  }

  const writeResults = await Promise.allSettled(
    acceptedAdmissions.map((admission) =>
      recordWatcherClientEvent(
        prisma,
        request,
        admission.event,
        identity,
      )
    )
  );
  const storedEvents: WatcherClientEventInput[] = [];
  let failed = 0;

  for (const [index, result] of writeResults.entries()) {
    const admission = acceptedAdmissions[index];
    if (result.status === "fulfilled") {
      storedEvents.push(admission.event);
      continue;
    }

    failed += 1;
    watcherTelemetryCoalescer.recordWriteFailure(admission);
    console.error("Failed to record watcher telemetry:", result.reason);
  }

  /*
   * Terminal result reconciliation is idempotent and append-only.
   * Telemetry storage remains successful even if reconciliation must
   * wait for a later parser run/event and retry.
   */
  if (
    identity.resolved &&
    identity.userUid
  ) {
    const latestStoredEvent = storedEvents.at(-1);
    if (latestStoredEvent && identity.userId && identity.apiKeyId) {
      try {
        await recordWarGraphWatcherHealth({
          prisma,
          userId: identity.userId,
          apiKeyId: identity.apiKeyId,
          eventType: latestStoredEvent.eventType,
          watcherId: latestStoredEvent.watcherId ?? null,
          sessionId: latestStoredEvent.sessionId ?? null,
          metadata: latestStoredEvent.metadata,
        });
      } catch (error) {
        // Telemetry remains durable even when the optional WarGraph projection
        // must retry on a later heartbeat.
        console.error("WarGraph Watcher health projection deferred:", error);
      }
    }

    const replayHashes = [
      ...new Set(
        storedEvents
          .filter((event) =>
            TERMINAL_RECONCILE_EVENT_TYPES.has(
              event.eventType
            )
          )
          .map((event) =>
            event.replayHash
          )
          .filter(
            (value): value is string =>
              Boolean(value)
          )
      ),
    ];

    if (replayHashes.length > 0) {
      try {
        const terminalGames =
          await prisma.gameStats.findMany({
            where: {
              userUid:
                identity.userUid,
              replayHash: {
                in:
                  replayHashes,
              },
              is_final:
                true,
            },
            select: {
              id: true,
            },
          });

        if (
          terminalGames.length >
          0
        ) {
          const report =
            await reconcileAutomaticWatcherTerminalResults(
              prisma,
              terminalGames.map(
                (game) =>
                  game.id
              )
            );

          if (
            report.createdCount >
            0
          ) {
            console.info(
              "AOE2WAR automatic watcher terminal reconciliation",
              report
            );
          }
        }
      } catch (error) {
        /*
         * Never turn telemetry delivery into a failure because a parser
         * run or terminal dependency has not arrived yet.
         */
        console.error(
          "Watcher terminal reconciliation deferred:",
          error
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    stored: storedEvents.length,
    suppressed,
    failed,
    linked: identity.resolved,
    userUid: identity.userUid,
  });
}
