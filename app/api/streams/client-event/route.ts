import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { resolveStreamRequestActor } from "@/lib/streamRequestAuth";
import {
  isWatcherClientEventType,
  normalizeWatcherString,
  recordWatcherClientEvent,
  sanitizeWatcherMetadata,
  type WatcherClientEventInput,
} from "@/lib/watcherTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const STREAM_EVENT_TYPES = new Set([
  "stream_sources_listed",
  "stream_capture_requested",
  "stream_preview_started",
  "stream_source_ready",
  "stream_started",
  "stream_chunk_uploaded",
  "stream_chunk_dropped",
  "stream_heartbeat",
  "stream_stopped",
  "stream_track_ended",
  "stream_recorder_error",
  "stream_chunk_failed",
  "stream_heartbeat_failed",
  "stream_error",
]);

function normalizeEventType(value: unknown): WatcherClientEventInput["eventType"] | null {
  const normalized = normalizeWatcherString(value, 40);
  if (!normalized || !STREAM_EVENT_TYPES.has(normalized) || !isWatcherClientEventType(normalized)) {
    return null;
  }
  return normalized;
}

export async function POST(request: NextRequest) {
  const prisma = getPrisma();
  const actor = await resolveStreamRequestActor(prisma, request, { touchWatcherKey: true });
  if (!actor) {
    return NextResponse.json({ ok: false, detail: "No active session." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventType = normalizeEventType(body?.eventType);
  if (!body || !eventType) {
    return NextResponse.json({ ok: false, detail: "Invalid stream event." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const sessionKey = normalizeWatcherString(body.sessionKey, 80);
  const streamId = normalizeWatcherString(body.streamId, 40);
  const watcherId = normalizeWatcherString(body.watcherId, 80);
  const input: WatcherClientEventInput = {
    eventType,
    appVersion: normalizeWatcherString(body.appVersion, 32) || (actor.authMode === "session" ? "web" : null),
    platform: normalizeWatcherString(body.platform, 24) || (actor.authMode === "session" ? "browser" : "watcher"),
    artifact: actor.authMode === "session" ? "browser_streamer" : "watcher_native_streamer",
    watcherId,
    sessionId: streamId ? `stream_${streamId}` : sessionKey,
    parseSource: actor.authMode === "session" ? "browser_stream" : "watcher_native_stream",
    parseReason: eventType,
    metadata: sanitizeWatcherMetadata({
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      sessionKey,
      streamId,
      watcherId,
      sourceType: actor.authMode === "session" ? "browser" : "watcher_native",
      captureMode: normalizeWatcherString(body.captureMode, 40),
      mediaMimeType: normalizeWatcherString(body.mediaMimeType, 120),
    }),
  };

  try {
    await recordWatcherClientEvent(prisma, request, input, {
      userId: actor.user.id,
      userUid: actor.user.uid,
      resolved: true,
    });
  } catch (error) {
    console.error("Failed to record stream client event:", error);
    return NextResponse.json({ ok: true, stored: 0 }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true, stored: 1 }, { headers: NO_STORE_HEADERS });
}
