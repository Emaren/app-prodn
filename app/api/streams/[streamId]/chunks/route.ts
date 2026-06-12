import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  isAoE2WarManagedStream,
  resolveStreamRequestActor,
} from "@/lib/streamRequestAuth";
import { writeStreamChunk } from "@/lib/streamStorage";
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

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > MAX_CHUNK_BYTES) {
    return NextResponse.json(
      { detail: "Stream chunk size is invalid." },
      { status: 413, headers: NO_STORE_HEADERS }
    );
  }

  await writeStreamChunk(id, sequence, Buffer.from(arrayBuffer));

  const mediaMimeType = request.headers.get("content-type")?.trim() || stream.mediaMimeType || "video/webm";
  const now = new Date();
  const nextLatestSeq = Math.max(stream.latestChunkSeq ?? -1, sequence);

  const updated = await prisma.gameWatchStream.update({
    where: { id },
    data: {
      status: "live",
      latestChunkSeq: nextLatestSeq,
      chunkCount: {
        increment: sequence > (stream.latestChunkSeq ?? -1) ? 1 : 0,
      },
      mediaMimeType,
      lastHeartbeatAt: now,
      startedAt: stream.startedAt ?? now,
    },
  });

  return NextResponse.json(
    { stream: toWatchStreamPayload(updated) },
    { headers: NO_STORE_HEADERS }
  );
}
