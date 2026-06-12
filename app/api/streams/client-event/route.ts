import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import { resolveRequestUid } from "@/lib/requestIdentity";
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
  "stream_capture_requested",
  "stream_source_ready",
  "stream_started",
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
  const uid = await resolveRequestUid(request);
  if (!uid) {
    return NextResponse.json({ ok: false, detail: "No active session." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventType = normalizeEventType(body?.eventType);
  if (!body || !eventType) {
    return NextResponse.json({ ok: false, detail: "Invalid stream event." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { uid },
    select: { id: true, uid: true },
  });

  if (!user) {
    return NextResponse.json({ ok: false, detail: "User not found." }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const sessionKey = normalizeWatcherString(body.sessionKey, 80);
  const streamId = normalizeWatcherString(body.streamId, 40);
  const input: WatcherClientEventInput = {
    eventType,
    appVersion: "web",
    platform: normalizeWatcherString(body.platform, 24) || "browser",
    artifact: "browser_streamer",
    watcherId: normalizeWatcherString(body.watcherId, 80),
    sessionId: streamId ? `stream_${streamId}` : sessionKey,
    parseSource: "browser_stream",
    parseReason: eventType,
    metadata: sanitizeWatcherMetadata({
      ...(body.metadata && typeof body.metadata === "object" ? body.metadata : {}),
      sessionKey,
      streamId,
      captureMode: normalizeWatcherString(body.captureMode, 40),
      mediaMimeType: normalizeWatcherString(body.mediaMimeType, 120),
    }),
  };

  try {
    await recordWatcherClientEvent(prisma, request, input, {
      userId: user.id,
      userUid: user.uid,
      resolved: true,
    });
  } catch (error) {
    console.error("Failed to record stream client event:", error);
    return NextResponse.json({ ok: true, stored: 0 }, { headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true, stored: 1 }, { headers: NO_STORE_HEADERS });
}
