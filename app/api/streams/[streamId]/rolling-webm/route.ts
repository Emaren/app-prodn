import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  AOE2WAR_STREAM_SOURCE_TYPES,
  type AoE2WarStreamSourceType,
} from "@/lib/streamRequestAuth";
import { listStreamChunkSequences, readStreamChunk } from "@/lib/streamStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const DEFAULT_WINDOW_CHUNKS = 18;
const MAX_WINDOW_CHUNKS = 48;

function clampWindowSize(raw: string | null) {
  const value = Number(raw);
  if (!Number.isInteger(value)) return DEFAULT_WINDOW_CHUNKS;
  return Math.min(MAX_WINDOW_CHUNKS, Math.max(4, value));
}

function newestAtOrBefore(sequences: number[], requestedEnd: number | null) {
  if (sequences.length === 0) return null;
  if (requestedEnd === null) return sequences[sequences.length - 1];

  for (let index = sequences.length - 1; index >= 0; index -= 1) {
    if (sequences[index] <= requestedEnd) return sequences[index];
  }

  return null;
}

function contiguousSuffix(sequences: number[], endSeq: number, windowSize: number) {
  const eligible = sequences.filter((sequence) => sequence > 0 && sequence <= endSeq);
  const suffix: number[] = [];
  let expected = endSeq;

  for (let index = eligible.length - 1; index >= 0 && suffix.length < windowSize; index -= 1) {
    const sequence = eligible[index];
    if (sequence !== expected) {
      if (suffix.length > 0) break;
      expected = sequence;
    }
    suffix.unshift(sequence);
    expected = sequence - 1;
  }

  return suffix;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ streamId: string }> }
) {
  const { streamId } = await context.params;
  const id = Number(streamId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { detail: "Invalid stream id." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const prisma = getPrisma();
  const stream = await prisma.gameWatchStream.findUnique({
    where: { id },
  });

  if (
    !stream ||
    stream.provider !== "aoe2war" ||
    !AOE2WAR_STREAM_SOURCE_TYPES.includes(stream.sourceType as AoE2WarStreamSourceType) ||
    stream.status === "removed"
  ) {
    return NextResponse.json(
      { detail: "Stream not found." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const availableSeqs = await listStreamChunkSequences(stream.id, 260);
  const mediaSeqs = availableSeqs.filter((sequence) => sequence > 0);
  const requestedEndRaw = request.nextUrl.searchParams.get("end");
  const requestedEnd = requestedEndRaw === null ? null : Number(requestedEndRaw);
  const safeRequestedEnd =
    requestedEnd !== null && Number.isInteger(requestedEnd) && requestedEnd >= 0
      ? requestedEnd
      : null;
  const endSeq = newestAtOrBefore(mediaSeqs, safeRequestedEnd);
  if (endSeq === null) {
    return NextResponse.json(
      { detail: "Stream has no media chunks yet." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const windowSize = clampWindowSize(request.nextUrl.searchParams.get("window"));
  const mediaRun = contiguousSuffix(mediaSeqs, endSeq, windowSize);
  if (mediaRun.length === 0) {
    return NextResponse.json(
      { detail: "Stream has no contiguous media run yet." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }

  const chunkSequences = availableSeqs.includes(0) ? [0, ...mediaRun] : mediaRun;
  try {
    const chunks = await Promise.all(
      chunkSequences.map((sequence) => readStreamChunk(stream.id, sequence))
    );
    const body = Buffer.concat(chunks);
    return new Response(body, {
      headers: {
        ...NO_STORE_HEADERS,
        "Content-Type": stream.mediaMimeType || "video/webm",
        "Content-Length": String(body.byteLength),
        "X-AOE2WAR-Stream-Mode": "rolling-webm",
        "X-AOE2WAR-Start-Seq": String(mediaRun[0]),
        "X-AOE2WAR-End-Seq": String(mediaRun[mediaRun.length - 1]),
        "X-AOE2WAR-Chunk-Count": String(mediaRun.length),
      },
    });
  } catch {
    return NextResponse.json(
      { detail: "Stream chunk window is unavailable." },
      { status: 404, headers: NO_STORE_HEADERS }
    );
  }
}
