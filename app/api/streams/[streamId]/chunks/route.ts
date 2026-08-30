import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import { normalizeStreamMediaMimeType } from "@/lib/streamMedia";
import {
  StreamChunkConflictError,
  StreamStorageLimitError,
  writeStreamChunk,
} from "@/lib/streamStorage";
import { maybeEndFinalizedStream } from "@/lib/streamFinalitySentinel";
import { toWatchStreamPayload } from "@/lib/watchStreams";

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
