import { NextResponse, type NextRequest } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  AOE2WAR_STREAM_SOURCE_TYPES,
  type AoE2WarStreamSourceType,
} from "@/lib/streamRequestAuth";
import { listStreamChunkSequences } from "@/lib/streamStorage";
import { toWatchStreamPayload } from "@/lib/watchStreams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const STALE_AFTER_MS = 120_000;

export async function GET(
  _request: NextRequest,
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

  const heartbeatTime = stream.lastHeartbeatAt?.getTime() ?? stream.updatedAt.getTime();
  const stale = ["starting", "live"].includes(stream.status)
    ? Date.now() - heartbeatTime > STALE_AFTER_MS
    : false;
  const latestSeq = stream.latestChunkSeq ?? -1;
  const availableSeqs = latestSeq >= 0 ? await listStreamChunkSequences(stream.id) : [];
  const availableMediaSeqs = availableSeqs.filter((sequence) => sequence > 0);
  const newestAvailableSeq = availableSeqs.length ? availableSeqs[availableSeqs.length - 1] : latestSeq;
  const recommendedStartSeq = newestAvailableSeq > 10 ? newestAvailableSeq - 10 : 0;

  return NextResponse.json(
    {
      stream: toWatchStreamPayload(stream),
      status: stale ? "stale" : stream.status,
      stale,
      mediaMimeType: stream.mediaMimeType || "video/webm;codecs=vp8,opus",
      latestSeq,
      newestAvailableSeq,
      chunkCount: stream.chunkCount,
      initSeq: availableSeqs.includes(0) ? 0 : null,
      recommendedStartSeq: latestSeq >= 0 ? recommendedStartSeq : null,
      availableSeqs,
      availableMediaSeqs,
      chunkUrlTemplate: `/api/streams/${stream.id}/chunks/{sequence}`,
      generatedAt: new Date().toISOString(),
    },
    { headers: NO_STORE_HEADERS }
  );
}
