import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import { normalizeStreamMediaMimeType } from "@/lib/streamMedia";
import { currentStreamMediaAdmission } from "@/lib/streamMediaAdmission";
import {
  StreamChunkConflictError,
  StreamStorageLimitError,
  writeStreamChunk,
} from "@/lib/streamStorage";
import { maybeEndFinalizedStream } from "@/lib/streamFinalitySentinel";
import { toWatchStreamPayload } from "@/lib/watchStreams";
import { recordWatcherClientEvent } from "@/lib/watcherTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

function readSequence(request: NextRequest) {
  const queryValue = request.nextUrl.searchParams.get("sequence");
  const headerValue = request.headers.get("x-stream-sequence");
  const sequence = Number(queryValue ?? headerValue);
  if (!Number.isInteger(sequence) || sequence < 0 || sequence > 2_000_000) {
    return null;
  }
  return sequence;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ streamId: string }> }
) {
  const prisma = getPrisma();
  const actor = await resolveStreamRequestActor(prisma, request, { touchWatcherKey: false });
  if (!actor) {
    return NextResponse.json(
      { detail: "No active session" },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const { streamId } = await context.params;
  const id = Number(streamId);
  const sequence = readSequence(request);
  if (!Number.isInteger(id) || id <= 0 || sequence === null) {
    return NextResponse.json(
      { detail: "Invalid stream chunk." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const stream = await prisma.gameWatchStream.findUnique({
    where: { id },
  });

  if (!stream || !isAoE2WarManagedStream(stream, actor.user.id)) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  if (stream.status === "ended" || stream.status === "removed") {
    return NextResponse.json(
      { detail: "Stream has ended." },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  const finalizedStream = await maybeEndFinalizedStream(prisma, stream);
  if (finalizedStream) {
    return NextResponse.json(
      { stream: toWatchStreamPayload(finalizedStream), finality: "replay_final" },
      { headers: NO_STORE_HEADERS }
    );
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && (contentLength <= 0 || contentLength > MAX_CHUNK_BYTES)) {
    return NextResponse.json(
      { detail: "Stream chunk size is invalid." },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  const mediaMimeType = normalizeStreamMediaMimeType(
    request.headers.get("content-type") || stream.mediaMimeType
  );
  if (!mediaMimeType) {
    return NextResponse.json(
      { detail: "Only WebM stream media is accepted." },
      { status: 415, headers: NO_STORE_HEADERS }
    );
  }


  if (stream.sourceType === "watcher_native") {
    const admission = currentStreamMediaAdmission(
      request.headers.get("x-aoe2war-stream-capabilities"),
    );
    if (!admission.allow) {
      const endedAt = new Date();
      const ended = await prisma.gameWatchStream.updateMany({
        where: { id, status: { in: ["starting", "live"] } },
        data: { status: "ended", endedAt, isPrimary: false },
      });

      try {
        if (ended.count === 1) await recordWatcherClientEvent(
          prisma,
          request,
          {
            eventType: "stream_media_shed",
            platform: actor.authMode === "watcher_key" ? "watcher" : "browser",
            artifact: "server_media_admission",
            sessionId: `stream_${id}`,
            parseSource: "watcher_native_stream",
            parseReason: admission.reason,
            metadata: {
              authority: "server_media_admission",
              streamId: id,
              sessionKey: stream.sessionKey,
              sequence,
              reason: admission.reason,
              retryAfterSeconds: admission.retryAfterSeconds,
              activeReplayUploads: admission.activeReplayUploads,
              operatorKillSwitch: admission.operatorKillSwitch,
            },
          },
          { userId: actor.user.id, userUid: actor.user.uid, resolved: true },
        );
      } catch (error) {
        console.warn("[streams/chunks] failed to record media shed telemetry", {
          streamId: id,
          reason: admission.reason,
          error,
        });
      }

      return NextResponse.json(
        {
          detail: "Watcher-native video was shed to protect replay and API traffic.",
          code: admission.code,
          terminal: true,
          reason: admission.reason,
          retryAfterSeconds: admission.retryAfterSeconds,
        },
        {
          status: 409,
          headers: {
            ...NO_STORE_HEADERS,
            "Retry-After": String(admission.retryAfterSeconds),
            "X-AoE2WAR-Media-Shed-Reason": admission.reason,
          },
        },
      );
    }
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > MAX_CHUNK_BYTES) {
    return NextResponse.json(
      { detail: "Stream chunk size is invalid." },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  let stored;
  try {
    stored = await writeStreamChunk(id, sequence, Buffer.from(arrayBuffer));
  } catch (error) {
    if (error instanceof StreamChunkConflictError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 409, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof StreamStorageLimitError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[streams/chunks] storage write failed", { streamId: id, sequence, error });
    return NextResponse.json(
      { detail: "Stream chunk could not be stored." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const now = new Date();
  const updateResult = await prisma.gameWatchStream.updateMany({
    where: {
      id,
      status: { in: ["starting", "live"] },
    },
    data: {
      status: "live",
      latestChunkSeq: stored.usage.latestSequence,
      chunkCount: stored.usage.chunkCount,
      mediaMimeType,
      lastHeartbeatAt: now,
      startedAt: stream.startedAt ?? now,
    },
  });

  if (updateResult.count !== 1) {
    return NextResponse.json(
      { detail: "Stream has ended." },
      { status: 409, headers: NO_STORE_HEADERS }
    );
  }

  const updated = await prisma.gameWatchStream.findUnique({ where: { id } });
  if (!updated) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated), chunkCreated: stored.created },
    { headers: NO_STORE_HEADERS }
  );
}
