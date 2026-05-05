import { NextRequest, NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isWatcherClientEventType,
  normalizeReplayFileName,
  normalizeWatcherString,
  readWatcherTelemetryApiKey,
  recordWatcherClientEvent,
  resolveWatcherTelemetryIdentity,
  sanitizeWatcherMetadata,
  type WatcherClientEventInput,
} from "@/lib/watcherTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_BATCH_EVENTS = 25;

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
    readWatcherTelemetryApiKey(request)
  );

  try {
    await Promise.all(
      events.map((event) => recordWatcherClientEvent(prisma, request, event, identity))
    );
  } catch (error) {
    console.error("Failed to record watcher telemetry:", error);
    return NextResponse.json({ ok: true, stored: 0, linked: identity.resolved });
  }

  return NextResponse.json({
    ok: true,
    stored: events.length,
    linked: identity.resolved,
    userUid: identity.userUid,
  });
}
