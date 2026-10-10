import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import { normalizeStreamMediaMimeType } from "@/lib/streamMedia";
import {parseStreamChunkSequence, isAdmissibleStreamChunkContentLength, readBoundedStreamChunkBody, StreamChunkBodyLimitError} from "@/lib/streamUploadProtocol";
import { currentStreamMediaAdmission } from "@/lib/streamMediaAdmission";
import {
  StreamChunkConflictError,
  StreamStorageLimitError,
  writeStreamChunk,
} from "@/lib/streamStorage";
import { maybeEndFinalizedStream } from "@/lib/streamFinalitySentinel";
import { lockVideoChunkWriter } from "@/lib/streamAdvisoryLocks";
import { toWatchStreamPayload } from "@/lib/watchStreams";
import { recordWatcherClientEvent } from "@/lib/watcherTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

function readSequence(request: NextRequest) {
  return parseStreamChunkSequence(
    request.nextUrl.searchParams.get("sequence"),
    request.headers.get("x-stream-sequence"),
  );
}

async function endRejectedVideo(prisma: ReturnType<typeof getPrisma>, id: number) {
  try {
    await prisma.gameWatchStream.updateMany({
      where: { id, status: { in: ["starting", "live"] } },
      data: { status: "ended", endedAt: new Date(), isPrimary: false },
    });
  } catch (error) {
    // Even a database outage must not convert terminal media refusal into
    // endless client retries. Never stop the separate replay monitoring path.
    console.warn("[streams/chunks] failed to mark refused video ended", {
      streamId: id, error,
    });
  }
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
      { detail: "Stream has ended.", code: "STREAM_ALREADY_ENDED", terminal: true },
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

  // A missing Content-Length is legal for chunked uploads. We still enforce
  // the hard byte limit after reading; explicit malformed lengths fail closed.
  if (!isAdmissibleStreamChunkContentLength(
    request.headers.get("content-length"), MAX_CHUNK_BYTES,
  )) {
    await endRejectedVideo(prisma, id);
    return NextResponse.json(
      { detail: "Stream chunk size is invalid.", code: "STREAM_CHUNK_TOO_LARGE", terminal: true },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  const mediaMimeType = normalizeStreamMediaMimeType(
    request.headers.get("content-type") || stream.mediaMimeType
  );
  if (!mediaMimeType) {
    await endRejectedVideo(prisma, id);
    return NextResponse.json(
      { detail: "Only WebM stream media is accepted.", code: "STREAM_FORMAT_UNSUPPORTED", terminal: true },
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

  let mediaBytes: Uint8Array;
  try {
    mediaBytes = await readBoundedStreamChunkBody(request.body, MAX_CHUNK_BYTES);
  } catch (error) {
    if (error instanceof StreamChunkBodyLimitError) {
      await endRejectedVideo(prisma, id);
      return NextResponse.json(
        { detail: error.message, code: "STREAM_CHUNK_TOO_LARGE", terminal: true },
        { status: 413, headers: NO_STORE_HEADERS }
      );
    }
    console.warn("[streams/chunks] video body transport interrupted", { streamId: id, error });
    return NextResponse.json(
      { detail: "Video body upload interrupted." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  // A local promise lock is insufficient across multiple Next.js processes.
  // Hold the same advisory transaction lock for the physical write and DB
  // acknowledgement. The on-disk temp/link protocol remains idempotent if
  // a database error forces a retry after bytes reach the mounted volume.
  try {
    const accepted = await prisma.$transaction(async (tx) => {
      await lockVideoChunkWriter(tx, id);
      const current = await tx.gameWatchStream.findUnique({ where: { id } });
      if (!current || !isAoE2WarManagedStream(current, actor.user.id) ||
          !["starting", "live"].includes(current.status)) return null;

      const stored = await writeStreamChunk(id, sequence, Buffer.from(mediaBytes));
      const now = new Date();
      const result = await tx.gameWatchStream.updateMany({
        where: { id, status: { in: ["starting", "live"] } },
        data: {
          status: "live",
          latestChunkSeq: stored.usage.latestSequence,
          chunkCount: stored.usage.chunkCount,
          mediaMimeType,
          lastHeartbeatAt: now,
          startedAt: current.startedAt ?? now,
        },
      });
      if (result.count !== 1) return null;
      const updated = await tx.gameWatchStream.findUnique({ where: { id } });
      return updated ? { stored, updated } : null;
    }, { maxWait: 4_000, timeout: 20_000 });

    if (!accepted) {
      return NextResponse.json(
        { detail: "Stream has ended.", code: "STREAM_ALREADY_ENDED", terminal: true },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(
      { stream: toWatchStreamPayload(accepted.updated), chunkCreated: accepted.stored.created },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof StreamChunkConflictError) {
      return NextResponse.json(
        { detail: error.message },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    if (error instanceof StreamStorageLimitError) {
      await endRejectedVideo(prisma, id);
      return NextResponse.json(
        { detail: error.message, code: "STREAM_STORAGE_LIMIT",
          reason: error.reason, terminal: true },
        { status: 413, headers: NO_STORE_HEADERS },
      );
    }
    console.error("[streams/chunks] media transaction failed", {
      streamId: id, sequence, error,
    });
    return NextResponse.json(
      { detail: "Stream chunk could not be stored." },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

}
